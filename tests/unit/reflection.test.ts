import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { summarizeSession } from "../../src/lib/reflection.js";
import { open, close, type BobmanDatabase } from "../../src/state/db.js";
import { createSession, emitEvent, updateSessionState } from "../../src/state/session.js";
import { handleSummarizeSession } from "../../src/tools/summarize-session.js";

interface SummaryShape {
  task_summary: { total: number; done: number; failed: number; pending: number; in_flight: number };
  events_by_type: Record<string, number>;
  state: string;
  session_summary_cached_at?: number;
}

describe("session reflection", () => {
  let dbDir: string;
  let db: BobmanDatabase;

  beforeEach(() => {
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-ref-"));
    db = open(path.join(dbDir, "d.db"));
  });

  afterEach(() => {
    close(db);
    fs.rmSync(dbDir, { recursive: true, force: true });
  });

  it("returns task counts and an events_by_type histogram", () => {
    const s = createSession(db, "test", dbDir);
    emitEvent(db, s.session_id, "task_dispatched", { task_id: "t1" });
    emitEvent(db, s.session_id, "task_dispatched", { task_id: "t2" });
    emitEvent(db, s.session_id, "task_evaluated", { task_id: "t1" });

    const summary = summarizeSession(db, s.session_id);
    expect(summary.events_by_type.task_dispatched).toBe(2);
    expect(summary.events_by_type.task_evaluated).toBe(1);
    expect(summary.task_summary.total).toBe(0);
  });

  it("auto-emits session_summary on EVALUATING -> COMPLETE", () => {
    const s = createSession(db, "test", dbDir);
    updateSessionState(db, s.session_id, "PLANNED", "test");
    updateSessionState(db, s.session_id, "IN_PROGRESS", "test");
    updateSessionState(db, s.session_id, "AWAITING_REPORT", "test");
    updateSessionState(db, s.session_id, "EVALUATING", "test");
    updateSessionState(db, s.session_id, "COMPLETE", "test");

    const summaries = db
      .prepare(
        `SELECT COUNT(*) AS c FROM events WHERE session_id = ? AND type = 'session_summary'`,
      )
      .get(s.session_id) as { c: number };
    expect(summaries.c).toBe(1);
  });

  it("subsequent summarize_session reads the cached COMPLETE summary", () => {
    const s = createSession(db, "test", dbDir);
    updateSessionState(db, s.session_id, "PLANNED", "test");
    updateSessionState(db, s.session_id, "IN_PROGRESS", "test");
    updateSessionState(db, s.session_id, "AWAITING_REPORT", "test");
    updateSessionState(db, s.session_id, "EVALUATING", "test");
    updateSessionState(db, s.session_id, "COMPLETE", "test");

    const res = handleSummarizeSession({ db }, { session_id: s.session_id }) as SummaryShape;
    expect(res.session_summary_cached_at).toBeGreaterThan(0);
    expect(res.state).toBe("COMPLETE");
  });

  it("`since` only counts events after the threshold", () => {
    const s = createSession(db, "test", dbDir);
    emitEvent(db, s.session_id, "early", {});
    const threshold = Date.now() + 1;
    // Give the wall clock a fence so subsequent events land on >= threshold.
    const wait = Date.now();
    while (Date.now() === wait) {
      /* spin briefly */
    }
    emitEvent(db, s.session_id, "late", {});
    const summary = summarizeSession(db, s.session_id, threshold);
    expect(summary.events_by_type.early).toBeUndefined();
    expect(summary.events_by_type.late).toBe(1);
  });
});
