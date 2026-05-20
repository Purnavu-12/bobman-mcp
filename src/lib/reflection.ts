import type { BobmanDatabase } from "../state/db.js";

export interface SessionSummary {
  session_id: string;
  state: string;
  started_at: number;
  finished_at: number | null;
  duration_ms: number;
  task_summary: {
    total: number;
    done: number;
    failed: number;
    pending: number;
    in_flight: number;
  };
  events_by_type: Record<string, number>;
  top_hotspots: { rel_path: string; commits: number; insertions: number; deletions: number }[];
  top_risks: { component_key: string; composite: number }[];
  session_summary_cached_at?: number;
}

interface SessionMeta {
  session_id: string;
  state: string;
  created_at: number;
  updated_at: number;
}

function fetchSession(db: BobmanDatabase, sessionId: string): SessionMeta | null {
  const row = db
    .prepare(`SELECT session_id, state, created_at, updated_at FROM sessions WHERE session_id = ?`)
    .get(sessionId) as SessionMeta | undefined;
  return row ?? null;
}

function getCachedSummary(db: BobmanDatabase, sessionId: string): SessionSummary | null {
  const row = db
    .prepare(
      `SELECT details_json, created_at FROM events
        WHERE session_id = ? AND type = 'session_summary'
        ORDER BY created_at DESC LIMIT 1`,
    )
    .get(sessionId) as { details_json: string; created_at: number } | undefined;
  if (!row) return null;
  try {
    const payload = JSON.parse(row.details_json) as SessionSummary;
    return { ...payload, session_summary_cached_at: row.created_at };
  } catch {
    return null;
  }
}

export function summarizeSession(
  db: BobmanDatabase,
  sessionId: string,
  since?: number,
): SessionSummary {
  const meta = fetchSession(db, sessionId);
  if (!meta) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  if (meta.state === "COMPLETE" && since === undefined) {
    const cached = getCachedSummary(db, sessionId);
    if (cached) return cached;
  }

  const sinceClause = since !== undefined ? `AND created_at >= ${Number(since)}` : "";

  const taskRow = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status='DONE' THEN 1 ELSE 0 END) AS done,
              SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) AS failed,
              SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN status='IN_FLIGHT' THEN 1 ELSE 0 END) AS in_flight
         FROM tasks WHERE session_id = ?`,
    )
    .get(sessionId) as {
    total: number;
    done: number | null;
    failed: number | null;
    pending: number | null;
    in_flight: number | null;
  };

  const eventRows = db
    .prepare(
      `SELECT type, COUNT(*) AS c FROM events
        WHERE session_id = ? ${sinceClause}
        GROUP BY type
        ORDER BY type ASC`,
    )
    .all(sessionId) as { type: string; c: number }[];

  const eventsByType: Record<string, number> = {};
  for (const r of eventRows) eventsByType[r.type] = r.c;

  const hotspots = db
    .prepare(
      `SELECT fch.rel_path AS rel_path,
              COUNT(DISTINCT fch.commit_sha) AS commits,
              COALESCE(SUM(fch.insertions), 0) AS insertions,
              COALESCE(SUM(fch.deletions), 0) AS deletions
         FROM file_change_history fch
        WHERE fch.session_id = ?
        GROUP BY fch.rel_path
        ORDER BY commits DESC, (insertions + deletions) DESC
        LIMIT 10`,
    )
    .all(sessionId) as {
    rel_path: string;
    commits: number;
    insertions: number;
    deletions: number;
  }[];

  const risks = db
    .prepare(
      `SELECT component_key, composite FROM risk_score
        WHERE session_id = ?
        ORDER BY composite DESC LIMIT 10`,
    )
    .all(sessionId) as { component_key: string; composite: number }[];

  const finished = meta.state === "COMPLETE" || meta.state === "BLOCKED" ? meta.updated_at : null;
  return {
    session_id: sessionId,
    state: meta.state,
    started_at: meta.created_at,
    finished_at: finished,
    duration_ms: (finished ?? Date.now()) - meta.created_at,
    task_summary: {
      total: taskRow.total ?? 0,
      done: taskRow.done ?? 0,
      failed: taskRow.failed ?? 0,
      pending: taskRow.pending ?? 0,
      in_flight: taskRow.in_flight ?? 0,
    },
    events_by_type: eventsByType,
    top_hotspots: hotspots,
    top_risks: risks,
  };
}
