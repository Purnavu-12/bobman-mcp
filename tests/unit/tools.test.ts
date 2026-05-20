import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BobmanError } from "../../src/lib/errors.js";
import { handleCreateSession } from "../../src/tools/create-session.js";
import { handleSeedTaskGraph } from "../../src/tools/seed-task-graph.js";
import { handleGetNextTask } from "../../src/tools/get-next-task.js";
import { handleReportComplete } from "../../src/tools/report-complete.js";
import { handleGetSessionStatus } from "../../src/tools/get-session-status.js";
import { getSession } from "../../src/state/session.js";
import { createTempDb } from "../helpers/db.js";

function seedThreeTaskGraph(db: ReturnType<typeof createTempDb>["db"], sessionId: string) {
  return handleSeedTaskGraph(
    { db },
    {
      session_id: sessionId,
      tasks: [
        {
          task_id: "task-a",
          instruction: "First",
          acceptance_criteria: "A done",
        },
        {
          task_id: "task-b",
          instruction: "Second",
          acceptance_criteria: "B done",
        },
        {
          task_id: "task-c",
          instruction: "Third",
          acceptance_criteria: "C done",
        },
      ],
      edges: [
        { from: "task-a", to: "task-b" },
        { from: "task-b", to: "task-c" },
      ],
    },
  );
}

describe("tool handlers", () => {
  it("create_session rejects invalid objective", () => {
    const { db, cleanup } = createTempDb();
    try {
      expect(() => handleCreateSession({ db }, { objective: "" })).toThrow(z.ZodError);
    } finally {
      cleanup();
    }
  });

  it("seed_task_graph rejects re-seed", () => {
    const { db, cleanup } = createTempDb();
    try {
      const { session_id } = handleCreateSession({ db }, { objective: "x" });
      seedThreeTaskGraph(db, session_id);
      expect(() => seedThreeTaskGraph(db, session_id)).toThrow(BobmanError);
    } finally {
      cleanup();
    }
  });

  it("report_complete rejects out-of-order state", () => {
    const { db, cleanup } = createTempDb();
    try {
      const { session_id } = handleCreateSession({ db }, { objective: "x" });
      seedThreeTaskGraph(db, session_id);
      expect(() =>
        handleReportComplete(
          { db },
          {
            session_id,
            task_id: "task-a",
            attempt: 1,
            status: "DONE",
          },
        ),
      ).toThrow(BobmanError);
    } finally {
      cleanup();
    }
  });

  it("create_session rejects bad repo_path and shutdown", () => {
    const { db, cleanup } = createTempDb();
    try {
      expect(() =>
        handleCreateSession({ db }, { objective: "x", repo_path: "not-a-real-dir-xyz" }),
      ).toThrow(BobmanError);
      expect(() =>
        handleCreateSession({ db, shuttingDown: () => true }, { objective: "x" }),
      ).toThrow(BobmanError);
    } finally {
      cleanup();
    }
  });

  it("get_next_task returns NOT_FOUND and respects terminal state", () => {
    const { db, cleanup } = createTempDb();
    try {
      expect(() =>
        handleGetNextTask({ db }, { session_id: "00000000-0000-4000-8000-000000000099" }),
      ).toThrow(BobmanError);
      const { session_id } = handleCreateSession({ db }, { objective: "x" });
      seedThreeTaskGraph(db, session_id);
      for (let i = 0; i < 3; i++) {
        const next = handleGetNextTask({ db }, { session_id });
        handleReportComplete(
          { db },
          {
            session_id,
            task_id: next.task_id,
            attempt: next.attempt,
            status: "DONE",
          },
        );
      }
      expect(() => handleGetNextTask({ db }, { session_id })).toThrow(BobmanError);
    } finally {
      cleanup();
    }
  });

  it("report_complete is idempotent and rejects stale attempt", () => {
    const { db, cleanup } = createTempDb();
    try {
      const { session_id } = handleCreateSession({ db }, { objective: "x" });
      seedThreeTaskGraph(db, session_id);
      const next = handleGetNextTask({ db }, { session_id });
      const first = handleReportComplete(
        { db },
        {
          session_id,
          task_id: next.task_id,
          attempt: next.attempt,
          status: "DONE",
        },
      );
      const second = handleReportComplete(
        { db },
        {
          session_id,
          task_id: next.task_id,
          attempt: next.attempt,
          status: "DONE",
        },
      );
      expect(second).toEqual(first);
      expect(() =>
        handleReportComplete(
          { db },
          {
            session_id,
            task_id: next.task_id,
            attempt: next.attempt + 1,
            status: "DONE",
          },
        ),
      ).toThrow(BobmanError);
    } finally {
      cleanup();
    }
  });

  it("DONE with failing tests is overruled to retry", () => {
    const { db, cleanup } = createTempDb();
    try {
      const { session_id } = handleCreateSession({ db }, { objective: "x" });
      handleSeedTaskGraph(
        { db },
        {
          session_id,
          tasks: [
            { task_id: "only", instruction: "x", acceptance_criteria: "y", max_attempts: 3 },
          ],
          edges: [],
        },
      );
      const next = handleGetNextTask({ db }, { session_id });
      const res = handleReportComplete(
        { db },
        {
          session_id,
          task_id: next.task_id,
          attempt: next.attempt,
          status: "DONE",
          test_results: { total: 2, passed: 1, failed: 1, skipped: 0 },
        },
      ) as { evaluated_status: string };
      expect(res.evaluated_status).toBe("RETRY");
      const ev = db
        .prepare(`SELECT type FROM events WHERE session_id = ? AND type = 'evaluation_overruled'`)
        .get(session_id) as { type: string } | undefined;
      expect(ev?.type).toBe("evaluation_overruled");
    } finally {
      cleanup();
    }
  });

  it("exhaustion blocks session and status reports blocker", () => {
    const { db, cleanup } = createTempDb();
    try {
      const { session_id } = handleCreateSession({ db }, { objective: "x" });
      handleSeedTaskGraph(
        { db },
        {
          session_id,
          tasks: [
            { task_id: "a", instruction: "a", acceptance_criteria: "a" },
            { task_id: "b", instruction: "b", acceptance_criteria: "b", max_attempts: 2 },
          ],
          edges: [{ from: "a", to: "b" }],
        },
      );
      const a1 = handleGetNextTask({ db }, { session_id });
      handleReportComplete(
        { db },
        {
          session_id,
          task_id: a1.task_id,
          attempt: a1.attempt,
          status: "DONE",
        },
      );
      const b1 = handleGetNextTask({ db }, { session_id });
      handleReportComplete(
        { db },
        {
          session_id,
          task_id: b1.task_id,
          attempt: b1.attempt,
          status: "FAILED",
        },
      );
      const b2 = handleGetNextTask({ db }, { session_id });
      handleReportComplete(
        { db },
        {
          session_id,
          task_id: b2.task_id,
          attempt: b2.attempt,
          status: "FAILED",
        },
      );
      expect(getSession(db, session_id)!.state).toBe("BLOCKED");
      expect(() => handleGetNextTask({ db }, { session_id })).toThrow(BobmanError);
      const status = handleGetSessionStatus({ db }, { session_id }) as {
        blockers: { task_id: string }[];
      };
      expect(status.blockers.some((b) => b.task_id === "b")).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("full happy path to COMPLETE", () => {
    const { db, cleanup } = createTempDb();
    try {
      const { session_id } = handleCreateSession({ db }, { objective: "Loop" });
      seedThreeTaskGraph(db, session_id);

      for (let i = 0; i < 3; i++) {
        const next = handleGetNextTask({ db }, { session_id });
        handleReportComplete(
          { db },
          {
            session_id,
            task_id: next.task_id,
            attempt: next.attempt,
            status: "DONE",
            test_results: { total: 1, passed: 1, failed: 0, skipped: 0 },
          },
        );
      }

      const session = getSession(db, session_id)!;
      expect(session.state).toBe("COMPLETE");
    } finally {
      cleanup();
    }
  });
});
