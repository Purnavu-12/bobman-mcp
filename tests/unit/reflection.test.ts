import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureSessionSummary,
  summarizeSession,
  type SessionSummary,
} from "../../src/lib/reflection.js";
import { open, close, type BobmanDatabase } from "../../src/state/db.js";
import { createSession, emitEvent, updateSessionState } from "../../src/state/session.js";
import { handleSummarizeSession } from "../../src/tools/summarize-session.js";

describe("session reflection", () => {
  let dbDir: string;
  let db: BobmanDatabase;

  beforeEach(() => {
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-ref-"));
    db = open(path.join(dbDir, "d.db"));
  });

  afterEach(() => {
    close(db);
    try {
      fs.rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // Windows may hold SQLite/git handles briefly after close.
    }
  });

  it("returns task counts and an events_by_type histogram", async () => {
    const s = createSession(db, "test", dbDir);
    emitEvent(db, s.session_id, "task_dispatched", { task_id: "t1" });
    emitEvent(db, s.session_id, "task_dispatched", { task_id: "t2" });
    emitEvent(db, s.session_id, "task_evaluated", { task_id: "t1" });

    const summary = await summarizeSession(db, s.session_id);
    expect(summary.shipped_vs_planned).toBeDefined();
    expect(summary.bottlenecks).toBeDefined();
    expect(summary.events_by_type.task_dispatched).toBe(2);
    expect(summary.events_by_type.task_evaluated).toBe(1);
    expect(summary.task_summary.total).toBe(0);
  });

  it("auto-emits session_summary on EVALUATING -> COMPLETE", async () => {
    const s = createSession(db, "test", dbDir);
    updateSessionState(db, s.session_id, "PLANNED", "test");
    updateSessionState(db, s.session_id, "IN_PROGRESS", "test");
    updateSessionState(db, s.session_id, "AWAITING_REPORT", "test");
    updateSessionState(db, s.session_id, "EVALUATING", "test");
    updateSessionState(db, s.session_id, "COMPLETE", "test");
    await ensureSessionSummary(db, s.session_id);

    const summaries = db
      .prepare(
        `SELECT COUNT(*) AS c FROM events WHERE session_id = ? AND type = 'session_summary'`,
      )
      .get(s.session_id) as { c: number };
    expect(summaries.c).toBe(1);
  });

  it("subsequent summarize_session reads the cached COMPLETE summary", async () => {
    const s = createSession(db, "test", dbDir);
    updateSessionState(db, s.session_id, "PLANNED", "test");
    updateSessionState(db, s.session_id, "IN_PROGRESS", "test");
    updateSessionState(db, s.session_id, "AWAITING_REPORT", "test");
    updateSessionState(db, s.session_id, "EVALUATING", "test");
    updateSessionState(db, s.session_id, "COMPLETE", "test");
    await ensureSessionSummary(db, s.session_id);

    const res: SessionSummary = await handleSummarizeSession({ db }, { session_id: s.session_id });
    expect(res.session_summary_cached_at).toBeGreaterThan(0);
    expect(res.state).toBe("COMPLETE");
  });

  it("`since` only counts events after the threshold", async () => {
    const s = createSession(db, "test", dbDir);
    emitEvent(db, s.session_id, "early", {});
    const threshold = Date.now() + 1;
    // Give the wall clock a fence so subsequent events land on >= threshold.
    const wait = Date.now();
    while (Date.now() === wait) {
      /* spin briefly */
    }
    emitEvent(db, s.session_id, "late", {});
    const summary = await summarizeSession(db, s.session_id, threshold);
    expect(summary.events_by_type.early).toBeUndefined();
    expect(summary.events_by_type.late).toBe(1);
  });
});
