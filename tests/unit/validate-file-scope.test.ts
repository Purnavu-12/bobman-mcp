import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BobmanError } from "../../src/lib/errors.js";
import { createSession } from "../../src/state/session.js";
import { handleValidateFileScope } from "../../src/tools/validate-file-scope.js";
import { createTempDb } from "../helpers/db.js";

function makeRepoWithFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-vfs-"));
  fs.writeFileSync(path.join(dir, "README.md"), "hi");
  fs.mkdirSync(path.join(dir, "src"));
  return dir;
}

describe("handleValidateFileScope", () => {
  it("resolves mixed existence", () => {
    const { db, cleanup } = createTempDb();
    try {
      const repo = makeRepoWithFile();
      const session = createSession(db, "x", repo);
      const out = handleValidateFileScope(
        { db },
        {
          session_id: session.session_id,
          paths: ["README.md", "missing.txt", "src"],
        },
      );
      expect(out.resolved).toHaveLength(3);
      expect(out.resolved[0].kind).toBe("file");
      expect(out.resolved[1].kind).toBe("missing");
      expect(out.resolved[2].kind).toBe("dir");
    } finally {
      cleanup();
    }
  });

  it("returns NOT_FOUND for unknown session", () => {
    const { db, cleanup } = createTempDb();
    try {
      expect(() =>
        handleValidateFileScope(
          { db },
          {
            session_id: "00000000-0000-4000-8000-000000000099",
            paths: ["foo"],
          },
        ),
      ).toThrow(BobmanError);
    } finally {
      cleanup();
    }
  });

  it("rejects empty paths", () => {
    const { db, cleanup } = createTempDb();
    try {
      const session = createSession(db, "x", makeRepoWithFile());
      expect(() =>
        handleValidateFileScope({ db }, { session_id: session.session_id, paths: [] }),
      ).toThrow();
    } finally {
      cleanup();
    }
  });

  it("rejects over-50 paths", () => {
    const { db, cleanup } = createTempDb();
    try {
      const session = createSession(db, "x", makeRepoWithFile());
      const tooMany = Array.from({ length: 51 }, (_, i) => `f-${i}.txt`);
      expect(() =>
        handleValidateFileScope({ db }, { session_id: session.session_id, paths: tooMany }),
      ).toThrow();
    } finally {
      cleanup();
    }
  });

  it("flags outside-repo paths", () => {
    const { db, cleanup } = createTempDb();
    try {
      const session = createSession(db, "x", makeRepoWithFile());
      const out = handleValidateFileScope(
        { db },
        { session_id: session.session_id, paths: ["..\\..\\etc\\passwd"] },
      );
      expect(out.resolved[0].error).toBe("outside_repo");
    } finally {
      cleanup();
    }
  });
});
