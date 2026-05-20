import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BobmanError } from "../../src/lib/errors.js";
import { open, close, type BobmanDatabase } from "../../src/state/db.js";
import { createSession, getSession, updateSessionState } from "../../src/state/session.js";
import { handleDecomposeObjective } from "../../src/tools/decompose-objective.js";
import { handleSeedTaskGraph } from "../../src/tools/seed-task-graph.js";

describe("decompose_objective tool", () => {
  let dir: string;
  let db: BobmanDatabase;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-dec-"));
    db = open(path.join(dir, "d.db"));
  });

  afterEach(() => {
    close(db);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("transitions INIT -> DECOMPOSING and returns tasks", () => {
    const s = createSession(db, "1. Add tests. 2. Ship it.", dir);
    const res = handleDecomposeObjective({ db }, { session_id: s.session_id });
    expect(res.state).toBe("DECOMPOSING");
    expect(res.tasks).toHaveLength(2);
    const reloaded = getSession(db, s.session_id);
    expect(reloaded?.state).toBe("DECOMPOSING");
  });

  it("does NOT write tasks to the DB until seed_task_graph is called", () => {
    const s = createSession(db, "1. Add tests. 2. Ship it.", dir);
    handleDecomposeObjective({ db }, { session_id: s.session_id });
    const count = db
      .prepare(`SELECT COUNT(*) AS c FROM tasks WHERE session_id = ?`)
      .get(s.session_id) as { c: number };
    expect(count.c).toBe(0);
  });

  it("rejects when session is not INIT", () => {
    const s = createSession(db, "Refactor", dir);
    updateSessionState(db, s.session_id, "PLANNED", "test_setup");
    expect(() =>
      handleDecomposeObjective({ db }, { session_id: s.session_id }),
    ).toThrow(BobmanError);
  });

  it("seed_task_graph accepts DECOMPOSING source state", () => {
    const s = createSession(db, "1. A 2. B", dir);
    handleDecomposeObjective({ db }, { session_id: s.session_id });
    const res = handleSeedTaskGraph(
      { db },
      {
        session_id: s.session_id,
        tasks: [
          { task_id: "t1", instruction: "A", acceptance_criteria: "Ok" },
          { task_id: "t2", instruction: "B", acceptance_criteria: "Ok" },
        ],
        edges: [{ from: "t1", to: "t2" }],
      },
    );
    expect(res.state).toBe("PLANNED");
  });

  it("unknown session returns NOT_FOUND", () => {
    expect(() =>
      handleDecomposeObjective(
        { db },
        { session_id: "00000000-0000-0000-0000-000000000000" },
      ),
    ).toThrow(BobmanError);
  });
});
