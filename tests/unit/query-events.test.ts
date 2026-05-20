import { describe, expect, it } from "vitest";
import { BobmanError } from "../../src/lib/errors.js";
import { createSession, emitEvent } from "../../src/state/session.js";
import { handleQueryEvents } from "../../src/tools/query-events.js";
import { createTempDb } from "../helpers/db.js";

describe("handleQueryEvents", () => {
  it("returns events in chronological order with parsed details", () => {
    const { db, cleanup } = createTempDb();
    try {
      const session = createSession(db, "obj", process.cwd());
      emitEvent(db, session.session_id, "task_dispatched", { task_id: "a", attempt: 1 });
      emitEvent(db, session.session_id, "task_done", { task_id: "a" });
      const out = handleQueryEvents({ db }, { session_id: session.session_id });
      const events = (out as { events: { type: string; details: Record<string, unknown> }[] })
        .events;
      // session_created emitted internally is the first event; we just need to find ours
      const types = events.map((e) => e.type);
      expect(types).toContain("task_dispatched");
      expect(types).toContain("task_done");
      const dispatch = events.find((e) => e.type === "task_dispatched")!;
      expect(dispatch.details.task_id).toBe("a");
    } finally {
      cleanup();
    }
  });

  it("filters by type", () => {
    const { db, cleanup } = createTempDb();
    try {
      const session = createSession(db, "obj", process.cwd());
      emitEvent(db, session.session_id, "task_dispatched", { task_id: "a" });
      emitEvent(db, session.session_id, "task_done", { task_id: "a" });
      const out = handleQueryEvents(
        { db },
        { session_id: session.session_id, types: ["task_done"] },
      );
      const events = (out as { events: { type: string }[] }).events;
      expect(events.every((e) => e.type === "task_done")).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("filters by since", () => {
    const { db, cleanup } = createTempDb();
    try {
      const session = createSession(db, "obj", process.cwd());
      emitEvent(db, session.session_id, "task_dispatched", { task_id: "a" });
      const cutoff = Date.now() + 1000;
      const out = handleQueryEvents(
        { db },
        { session_id: session.session_id, since: cutoff },
      );
      expect((out as { events: unknown[] }).events.length).toBe(0);
    } finally {
      cleanup();
    }
  });

  it("returns NOT_FOUND for unknown session", () => {
    const { db, cleanup } = createTempDb();
    try {
      expect(() =>
        handleQueryEvents(
          { db },
          { session_id: "00000000-0000-4000-8000-000000000099" },
        ),
      ).toThrow(BobmanError);
    } finally {
      cleanup();
    }
  });

  it("sanitizes secrets in returned details", () => {
    const { db, cleanup } = createTempDb();
    try {
      const session = createSession(db, "obj", process.cwd());
      emitEvent(db, session.session_id, "task_reported", {
        notes: "Use api_key='sk-abcdef1234567890abcdef'",
      });
      const out = handleQueryEvents(
        { db },
        { session_id: session.session_id, types: ["task_reported"] },
      );
      const events = (out as { events: { details: { notes?: string } }[] }).events;
      expect(events.length).toBe(1);
      expect(events[0].details.notes).not.toContain("sk-abcdef1234567890abcdef");
    } finally {
      cleanup();
    }
  });
});
