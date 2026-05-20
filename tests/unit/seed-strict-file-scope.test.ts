import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BobmanError } from "../../src/lib/errors.js";
import { handleCreateSession } from "../../src/tools/create-session.js";
import { handleSeedTaskGraph } from "../../src/tools/seed-task-graph.js";
import { createTempDb } from "../helpers/db.js";

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-strict-"));
  fs.writeFileSync(path.join(repo, "exists.md"), "hi");
  return repo;
}

describe("seed_task_graph strict file scope", () => {
  it("default (non-strict) accepts missing paths", () => {
    const { db, cleanup } = createTempDb();
    try {
      const repo = makeRepo();
      const { session_id } = handleCreateSession({ db }, { objective: "x", repo_path: repo });
      const out = handleSeedTaskGraph(
        { db },
        {
          session_id,
          tasks: [
            {
              task_id: "a",
              instruction: "a",
              acceptance_criteria: "a",
              file_scope: ["missing.txt"],
            },
          ],
          edges: [],
        },
      );
      expect(out.state).toBe("PLANNED");
    } finally {
      cleanup();
    }
  });

  it("strict mode rejects missing path with INVALID_INPUT", () => {
    const { db, cleanup } = createTempDb();
    try {
      const repo = makeRepo();
      const { session_id } = handleCreateSession({ db }, { objective: "x", repo_path: repo });
      expect(() =>
        handleSeedTaskGraph(
          { db, strictFileScope: true },
          {
            session_id,
            tasks: [
              {
                task_id: "a",
                instruction: "a",
                acceptance_criteria: "a",
                file_scope: ["missing.txt"],
              },
            ],
            edges: [],
          },
        ),
      ).toThrow(BobmanError);
    } finally {
      cleanup();
    }
  });

  it("strict mode accepts task with only existing paths", () => {
    const { db, cleanup } = createTempDb();
    try {
      const repo = makeRepo();
      const { session_id } = handleCreateSession({ db }, { objective: "x", repo_path: repo });
      const out = handleSeedTaskGraph(
        { db, strictFileScope: true },
        {
          session_id,
          tasks: [
            {
              task_id: "a",
              instruction: "a",
              acceptance_criteria: "a",
              file_scope: ["exists.md"],
            },
          ],
          edges: [],
        },
      );
      expect(out.state).toBe("PLANNED");
    } finally {
      cleanup();
    }
  });
});
