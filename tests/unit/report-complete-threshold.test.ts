import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { close, open, type BobmanDatabase } from "../../src/state/db.js";
import { createSession, updateSessionState } from "../../src/state/session.js";
import { seedTaskGraph } from "../../src/state/task-graph.js";
import { handleReportComplete } from "../../src/tools/report-complete.js";
import { handleGetNextTask } from "../../src/tools/get-next-task.js";

describe("report_complete testPassThreshold", () => {
  let dbDir: string;
  let db: BobmanDatabase;

  beforeEach(() => {
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-thresh-"));
    db = open(path.join(dbDir, "d.db"));
  });

  afterEach(() => {
    close(db);
    fs.rmSync(dbDir, { recursive: true, force: true });
  });

  function setupAwaitingReport() {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-repo-"));
    const session = createSession(db, "test", repo);
    seedTaskGraph(
      db,
      session,
      [{ task_id: "t1", instruction: "do", acceptance_criteria: "ok", max_attempts: 3 }],
      [],
    );
    updateSessionState(db, session.session_id, "PLANNED", "test");
    handleGetNextTask({ db, testPassThreshold: 0.8 }, { session_id: session.session_id });
    return session;
  }

  it("accepts DONE when pass rate meets threshold 1.0", () => {
    const session = setupAwaitingReport();
    const res = handleReportComplete(
      { db, testPassThreshold: 1 },
      {
        session_id: session.session_id,
        task_id: "t1",
        attempt: 1,
        status: "DONE",
        test_results: { total: 10, passed: 10, failed: 0, skipped: 0 },
      },
    ) as { evaluated_status: string };
    expect(res.evaluated_status).toBe("DONE");
  });

  it("overrules DONE when pass rate below threshold", () => {
    const session = setupAwaitingReport();
    const res = handleReportComplete(
      { db, testPassThreshold: 1 },
      {
        session_id: session.session_id,
        task_id: "t1",
        attempt: 1,
        status: "DONE",
        test_results: { total: 10, passed: 8, failed: 2, skipped: 0 },
      },
    ) as { evaluated_status: string; next_state: string };
    expect(res.evaluated_status).toBe("RETRY");
    expect(res.next_state).toBe("RETRYING");
    const ev = db
      .prepare(
        `SELECT type FROM events WHERE session_id = ? AND type = 'evaluation_threshold_failed'`,
      )
      .get(session.session_id) as { type: string } | undefined;
    expect(ev?.type).toBe("evaluation_threshold_failed");
  });

  it("accepts DONE at 80% when threshold is 0.8", () => {
    const session = setupAwaitingReport();
    const res = handleReportComplete(
      { db, testPassThreshold: 0.8 },
      {
        session_id: session.session_id,
        task_id: "t1",
        attempt: 1,
        status: "DONE",
        test_results: { total: 10, passed: 8, failed: 0, skipped: 2 },
      },
    ) as { evaluated_status: string };
    expect(res.evaluated_status).toBe("DONE");
  });
});
