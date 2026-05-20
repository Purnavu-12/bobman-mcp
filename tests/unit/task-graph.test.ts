import { describe, expect, it } from "vitest";
import { BobmanError } from "../../src/lib/errors.js";
import { createSession } from "../../src/state/session.js";
import {
  pickNextEligibleTask,
  seedTaskGraph,
  validateSeedInput,
  dispatchTask,
  getInFlightRun,
} from "../../src/state/task-graph.js";
import { createTempDb } from "../helpers/db.js";

describe("task graph", () => {
  it("rejects direct cycle", () => {
    expect(() =>
      validateSeedInput(
        [
          { task_id: "a", instruction: "a", acceptance_criteria: "a" },
          { task_id: "b", instruction: "b", acceptance_criteria: "b" },
        ],
        [
          { from: "a", to: "b" },
          { from: "b", to: "a" },
        ],
      ),
    ).toThrow(BobmanError);
  });

  it("rejects indirect cycle", () => {
    expect(() =>
      validateSeedInput(
        [
          { task_id: "a", instruction: "a", acceptance_criteria: "a" },
          { task_id: "b", instruction: "b", acceptance_criteria: "b" },
          { task_id: "c", instruction: "c", acceptance_criteria: "c" },
        ],
        [
          { from: "a", to: "b" },
          { from: "b", to: "c" },
          { from: "c", to: "a" },
        ],
      ),
    ).toThrow(BobmanError);
  });

  it("rejects duplicate task_id and unknown edge endpoint", () => {
    expect(() =>
      validateSeedInput(
        [
          { task_id: "a", instruction: "a", acceptance_criteria: "a" },
          { task_id: "a", instruction: "b", acceptance_criteria: "b" },
        ],
        [],
      ),
    ).toThrow(BobmanError);
    expect(() =>
      validateSeedInput([{ task_id: "a", instruction: "a", acceptance_criteria: "a" }], [
        { from: "a", to: "missing" },
      ]),
    ).toThrow(BobmanError);
  });

  it("rejects self-loop", () => {
    expect(() =>
      validateSeedInput([{ task_id: "a", instruction: "a", acceptance_criteria: "a" }], [
        { from: "a", to: "a" },
      ]),
    ).toThrow(BobmanError);
  });

  it("rejects empty graph", () => {
    expect(() => validateSeedInput([], [])).toThrow(BobmanError);
  });

  it("rejects too many tasks", () => {
    const tasks = Array.from({ length: 501 }, (_, i) => ({
      task_id: `t-${i}`,
      instruction: "x",
      acceptance_criteria: "y",
    }));
    expect(() => validateSeedInput(tasks, [])).toThrow(BobmanError);
  });

  it("respects dependencies when picking", () => {
    const { db, cleanup } = createTempDb();
    try {
      const session = createSession(db, "obj", process.cwd());
      seedTaskGraph(
        db,
        session,
        [
          { task_id: "a", instruction: "a", acceptance_criteria: "a" },
          { task_id: "b", instruction: "b", acceptance_criteria: "b" },
        ],
        [{ from: "a", to: "b" }],
      );
      const first = pickNextEligibleTask(db, session.session_id);
      expect(first?.task_id).toBe("a");
      dispatchTask(db, first!, 1);
      const blocked = pickNextEligibleTask(db, session.session_id);
      expect(blocked).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("pickNextTask idempotent via in-flight run", () => {
    const { db, cleanup } = createTempDb();
    try {
      const session = createSession(db, "obj", process.cwd());
      seedTaskGraph(
        db,
        session,
        [{ task_id: "only", instruction: "x", acceptance_criteria: "y" }],
        [],
      );
      const task = pickNextEligibleTask(db, session.session_id)!;
      dispatchTask(db, task, 1);
      dispatchTask(db, task, 1);
      const inFlight = getInFlightRun(db, session.session_id);
      expect(inFlight?.task_id).toBe("only");
      expect(inFlight?.attempt).toBe(1);
    } finally {
      cleanup();
    }
  });
});
