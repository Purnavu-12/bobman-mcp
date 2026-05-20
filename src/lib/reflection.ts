import { simpleGit } from "simple-git";
import type { BobmanDatabase } from "../state/db.js";
import { nowMs } from "../state/db.js";

export interface PlannedTask {
  task_id: string;
  instruction: string;
}

export interface ShippedVsPlanned {
  planned_tasks: PlannedTask[];
  shipped_commits_count: number;
  shipped_files_touched: number;
  tag_releases: string[];
}

export interface BottleneckSignals {
  retry_queued_count: number;
  evaluation_overruled_count: number;
  evaluation_threshold_failed_count: number;
  commits_per_day: number;
  top_blocker_events: { type: string; count: number }[];
}

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
  shipped_vs_planned: ShippedVsPlanned;
  bottlenecks: BottleneckSignals;
  session_summary_cached_at?: number;
}

interface SessionMeta {
  session_id: string;
  repo_path: string;
  state: string;
  created_at: number;
  updated_at: number;
}

async function listReleaseTags(repoPath: string): Promise<string[]> {
  try {
    const git = simpleGit(repoPath);
    const tags = await git.tags();
    return tags.all.filter((t) => /^v\d/i.test(t) || /^release/i.test(t)).slice(0, 20);
  } catch {
    return [];
  }
}

function buildShippedVsPlanned(
  db: BobmanDatabase,
  sessionId: string,
  sinceMs: number,
  _repoPath: string,
): ShippedVsPlanned {
  const planned = db
    .prepare(
      `SELECT task_id, instruction FROM tasks
        WHERE session_id = ? AND status = 'DONE'
        ORDER BY task_id ASC`,
    )
    .all(sessionId) as PlannedTask[];

  const commitRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM commits
        WHERE session_id = ? AND committed_at >= ?`,
    )
    .get(sessionId, sinceMs) as { c: number };

  const filesRow = db
    .prepare(
      `SELECT COUNT(DISTINCT fch.rel_path) AS c
         FROM file_change_history fch
         JOIN commits c ON c.commit_sha = fch.commit_sha
        WHERE fch.session_id = ? AND c.committed_at >= ?`,
    )
    .get(sessionId, sinceMs) as { c: number };

  return {
    planned_tasks: planned,
    shipped_commits_count: commitRow.c ?? 0,
    shipped_files_touched: filesRow.c ?? 0,
    tag_releases: [],
  };
}

function buildBottlenecks(
  db: BobmanDatabase,
  sessionId: string,
  sinceMs: number,
  startedAt: number,
  eventsByType: Record<string, number>,
): BottleneckSignals {
  const blockerTypes = [
    "retry_queued",
    "evaluation_overruled",
    "evaluation_threshold_failed",
    "agent_blocked",
    "task_exhausted",
  ];
  const top_blocker_events = blockerTypes
    .map((type) => ({ type, count: eventsByType[type] ?? 0 }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count);

  const commitRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM commits
        WHERE session_id = ? AND committed_at >= ?`,
    )
    .get(sessionId, sinceMs) as { c: number };

  const spanDays = Math.max(1, (Date.now() - startedAt) / (24 * 60 * 60 * 1000));
  const commitsPerDay = (commitRow.c ?? 0) / spanDays;

  return {
    retry_queued_count: eventsByType.retry_queued ?? 0,
    evaluation_overruled_count: eventsByType.evaluation_overruled ?? 0,
    evaluation_threshold_failed_count: eventsByType.evaluation_threshold_failed ?? 0,
    commits_per_day: Math.round(commitsPerDay * 100) / 100,
    top_blocker_events,
  };
}

function fetchSession(db: BobmanDatabase, sessionId: string): SessionMeta | null {
  const row = db
    .prepare(
      `SELECT session_id, repo_path, state, created_at, updated_at FROM sessions WHERE session_id = ?`,
    )
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

/** Persist session_summary event if missing (idempotent). */
export async function ensureSessionSummary(
  db: BobmanDatabase,
  sessionId: string,
): Promise<void> {
  if (getCachedSummary(db, sessionId)) return;
  const summary = await buildSessionSummary(db, sessionId);
  const persist = db.transaction(() => {
    if (getCachedSummary(db, sessionId)) return;
    const ts = nowMs();
    db.prepare(
      `INSERT INTO events (session_id, type, details_json, created_at) VALUES (?, ?, ?, ?)`,
    ).run(sessionId, "session_summary", JSON.stringify(summary), ts);
  });
  persist();
}

export async function summarizeSession(
  db: BobmanDatabase,
  sessionId: string,
  since?: number,
): Promise<SessionSummary> {
  const meta = fetchSession(db, sessionId);
  if (!meta) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  if (meta.state === "COMPLETE" && since === undefined) {
    const cached = getCachedSummary(db, sessionId);
    if (cached) return cached;
    await ensureSessionSummary(db, sessionId);
    return getCachedSummary(db, sessionId) ?? (await buildSessionSummary(db, sessionId));
  }

  return buildSessionSummary(db, sessionId, since);
}

async function buildSessionSummary(
  db: BobmanDatabase,
  sessionId: string,
  since?: number,
): Promise<SessionSummary> {
  const meta = fetchSession(db, sessionId);
  if (!meta) {
    throw new Error(`Session not found: ${sessionId}`);
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

  const sinceMs = since ?? meta.created_at;
  const shipped = buildShippedVsPlanned(db, sessionId, sinceMs, meta.repo_path);
  shipped.tag_releases = await listReleaseTags(meta.repo_path);
  const bottlenecks = buildBottlenecks(
    db,
    sessionId,
    sinceMs,
    meta.created_at,
    eventsByType,
  );

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
    shipped_vs_planned: shipped,
    bottlenecks,
  };
}
