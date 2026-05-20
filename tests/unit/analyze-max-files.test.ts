import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeRepo } from "../../src/analyzer/manager.js";
import { open, close, type BobmanDatabase } from "../../src/state/db.js";
import { createSession } from "../../src/state/session.js";

describe("analyzeMaxFiles", () => {
  let dbDir: string;
  let db: BobmanDatabase;

  beforeEach(() => {
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-maxf-"));
    db = open(path.join(dbDir, "d.db"));
  });

  afterEach(() => {
    close(db);
    fs.rmSync(dbDir, { recursive: true, force: true, maxRetries: 3 });
  });

  it("caps files scanned when maxFiles is set", async () => {
    const repo = path.join(dbDir, "repo");
    fs.mkdirSync(repo, { recursive: true });
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(repo, `f${i}.ts`), `export const v${i} = ${i};\n`);
    }
    const s = createSession(db, "cap", repo);
    const summary = await analyzeRepo(db, s.session_id, repo, { maxFiles: 3 });
    expect(summary.files_analyzed + summary.files_skipped).toBeLessThanOrEqual(10);
    expect(summary.files_analyzed).toBeLessThanOrEqual(3);
  });
});
