import type { BobmanDatabase } from "./db.js";
import { nowMs } from "./db.js";
import { BobmanError } from "../lib/errors.js";
import { ensureSessionSummary } from "../lib/reflection.js";
import { ensurePrimaryRepo } from "./repos.js";
import type { SessionRow, SessionState } from "../schemas/persistence.js";
import { newSessionId } from "../lib/id.js";

export const LEGAL_TRANSITIONS: Record<SessionState, SessionState[]> = {
  INIT: ["DECOMPOSING", "ANALYZING", "PLANNED"],
  DECOMPOSING: ["PLANNED", "BLOCKED"],
  ANALYZING: ["INIT", "PLANNED", "BLOCKED"],
  PLANNED: ["ANALYZING", "IN_PROGRESS"],
  IN_PROGRESS: ["AWAITING_REPORT"],
  AWAITING_REPORT: ["EVALUATING"],
  EVALUATING: ["IN_PROGRESS", "RETRYING", "BLOCKED", "COMPLETE"],
  RETRYING: ["IN_PROGRESS", "AWAITING_REPORT", "BLOCKED"],
  BLOCKED: [],
  COMPLETE: [],
};

export function isLegalTransition(from: SessionState, to: SessionState): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionOrThrow(
  current: SessionState,
  next: SessionState,
  attemptedAction: string,
): void {
  if (!isLegalTransition(current, next)) {
    throw new BobmanError("INVALID_TRANSITION", `Cannot transition ${current} -> ${next}`, {
      current_state: current,
      attempted_action: attemptedAction,
      next_state: next,
    });
  }
}

export function emitEvent(
  db: BobmanDatabase,
  sessionId: string,
  type: string,
  details: Record<string, unknown>,
): void {
  db.prepare(
    `INSERT INTO events (session_id, type, details_json, created_at) VALUES (?, ?, ?, ?)`,
  ).run(sessionId, type, JSON.stringify(details), nowMs());
}

export function createSession(
  db: BobmanDatabase,
  objective: string,
  repoPath: string,
): SessionRow {
  const sessionId = newSessionId();
  const ts = nowMs();
  db.prepare(
    `INSERT INTO sessions (session_id, repo_path, objective, state, created_at, updated_at)
     VALUES (?, ?, ?, 'INIT', ?, ?)`,
  ).run(sessionId, repoPath, objective, ts, ts);
  ensurePrimaryRepo(db, sessionId, repoPath);
  emitEvent(db, sessionId, "session_created", { objective, repo_path: repoPath });
  return getSession(db, sessionId)!;
}

export function getSession(db: BobmanDatabase, sessionId: string): SessionRow | null {
  const row = db
    .prepare(
      `SELECT session_id, repo_path, objective, state, created_at, updated_at
       FROM sessions WHERE session_id = ?`,
    )
    .get(sessionId) as SessionRow | undefined;
  return row ?? null;
}

export function updateSessionState(
  db: BobmanDatabase,
  sessionId: string,
  next: SessionState,
  attemptedAction: string,
  eventType?: string,
  eventDetails?: Record<string, unknown>,
): SessionRow {
  const session = getSession(db, sessionId);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${sessionId}`, {
      entity: "session_id",
      session_id: sessionId,
    });
  }
  transitionOrThrow(session.state, next, attemptedAction);
  const ts = nowMs();
  db.prepare(`UPDATE sessions SET state = ?, updated_at = ? WHERE session_id = ?`).run(
    next,
    ts,
    sessionId,
  );
  if (eventType) {
    emitEvent(db, sessionId, eventType, eventDetails ?? { from: session.state, to: next });
  }
  if (next === "COMPLETE" && session.state !== "COMPLETE") {
    void ensureSessionSummary(db, sessionId).catch(() => {});
  }
  return getSession(db, sessionId)!;
}

export function assertSessionState(
  session: SessionRow,
  allowed: SessionState[],
  attemptedAction: string,
): void {
  if (!allowed.includes(session.state)) {
    throw new BobmanError(
      "INVALID_TRANSITION",
      `Session ${session.session_id} is in state ${session.state}, expected one of ${allowed.join(", ")}`,
      { current_state: session.state, attempted_action: attemptedAction, allowed },
    );
  }
}
