import type { BobmanDatabase } from "../state/db.js";
import { nowMs } from "../state/db.js";
import { emitEvent } from "../state/session.js";

export interface RiskComponents {
  fan_in: number;
  churn: number;
  conflict: number;
  coverage_gap: number;
}

export interface RiskScore extends RiskComponents {
  session_id: string;
  component_key: string;
  kind: "file" | "symbol";
  composite: number;
  computed_at: number;
}

const WEIGHTS = {
  fan_in: 0.35,
  churn: 0.3,
  conflict: 0.2,
  coverage_gap: 0.15,
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const WINDOW_DAYS_DEFAULT = 90;

function normalize(value: number, max: number): number {
  if (max <= 0) return 0;
  const v = Math.min(1, value / max);
  return Math.max(0, v);
}

function recentInvalidation(db: BobmanDatabase, sessionId: string): number {
  const row = db
    .prepare(
      `SELECT MAX(created_at) AS t FROM events
        WHERE session_id = ? AND type = 'risk_cache_invalidated'`,
    )
    .get(sessionId) as { t: number | null };
  return row.t ?? 0;
}

function fanInForFile(db: BobmanDatabase, sessionId: string, relPath: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT cg.from_symbol_id) AS c
         FROM call_graph cg
         JOIN symbols s ON s.symbol_id = cg.to_symbol_id
         JOIN file_index f ON f.file_id = s.file_id
        WHERE f.session_id = ? AND f.rel_path = ?`,
    )
    .get(sessionId, relPath) as { c: number };
  return row.c;
}

function fanInForSymbol(db: BobmanDatabase, sessionId: string, qname: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c
         FROM call_graph cg
         JOIN symbols s ON s.symbol_id = cg.to_symbol_id
         JOIN file_index f ON f.file_id = s.file_id
        WHERE f.session_id = ? AND s.qualified_name = ?`,
    )
    .get(sessionId, qname) as { c: number };
  return row.c;
}

function churnForFile(
  db: BobmanDatabase,
  sessionId: string,
  relPath: string,
  windowDays: number,
): { churn: number; conflict: number } {
  const since = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT fch.commit_sha) AS commits,
              COALESCE(SUM(fch.was_conflict), 0) AS conflicts
         FROM file_change_history fch
         JOIN commits c ON c.commit_sha = fch.commit_sha
        WHERE fch.session_id = ? AND fch.rel_path = ? AND c.committed_at >= ?`,
    )
    .get(sessionId, relPath, since) as { commits: number | null; conflicts: number | null };
  return { churn: row.commits ?? 0, conflict: row.conflicts ?? 0 };
}

function symbolToFile(
  db: BobmanDatabase,
  sessionId: string,
  qname: string,
): string | null {
  const row = db
    .prepare(
      `SELECT f.rel_path FROM symbols s
         JOIN file_index f ON f.file_id = s.file_id
        WHERE f.session_id = ? AND s.qualified_name = ?
        LIMIT 1`,
    )
    .get(sessionId, qname) as { rel_path: string } | undefined;
  return row?.rel_path ?? null;
}

function coverageGapForFile(): number {
  // No coverage data in v1. Constant 0.5 mid-risk for any source file is too noisy;
  // we return 0 to ensure other components dominate and the metric is reserved for v2.
  return 0;
}

function loadCached(
  db: BobmanDatabase,
  sessionId: string,
  componentKey: string,
): RiskScore | null {
  const row = db
    .prepare(
      `SELECT session_id, component_key, kind, composite, fan_in, churn, conflict, coverage_gap, computed_at
         FROM risk_score WHERE session_id = ? AND component_key = ?`,
    )
    .get(sessionId, componentKey) as RiskScore | undefined;
  if (!row) return null;
  const invAt = recentInvalidation(db, sessionId);
  if (invAt > row.computed_at) return null;
  if (Date.now() - row.computed_at > CACHE_TTL_MS) return null;
  return row;
}

function storeScore(db: BobmanDatabase, score: RiskScore): void {
  db.prepare(
    `INSERT INTO risk_score
       (session_id, component_key, kind, composite, fan_in, churn, conflict, coverage_gap, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, component_key) DO UPDATE SET
       kind = excluded.kind,
       composite = excluded.composite,
       fan_in = excluded.fan_in,
       churn = excluded.churn,
       conflict = excluded.conflict,
       coverage_gap = excluded.coverage_gap,
       computed_at = excluded.computed_at`,
  ).run(
    score.session_id,
    score.component_key,
    score.kind,
    score.composite,
    score.fan_in,
    score.churn,
    score.conflict,
    score.coverage_gap,
    score.computed_at,
  );
}

export interface ScoreOptions {
  windowDays?: number;
  bypassCache?: boolean;
}

export function scoreFile(
  db: BobmanDatabase,
  sessionId: string,
  relPath: string,
  options: ScoreOptions = {},
): RiskScore {
  const componentKey = `file:${relPath}`;
  if (!options.bypassCache) {
    const cached = loadCached(db, sessionId, componentKey);
    if (cached) return cached;
  }

  const windowDays = options.windowDays ?? WINDOW_DAYS_DEFAULT;
  const fanIn = fanInForFile(db, sessionId, relPath);
  const { churn, conflict } = churnForFile(db, sessionId, relPath, windowDays);
  const coverageGap = coverageGapForFile();

  const score: RiskScore = {
    session_id: sessionId,
    component_key: componentKey,
    kind: "file",
    fan_in: normalize(fanIn, 50),
    churn: normalize(churn, 50),
    conflict: normalize(conflict, 5),
    coverage_gap: coverageGap,
    composite: 0,
    computed_at: nowMs(),
  };
  score.composite =
    score.fan_in * WEIGHTS.fan_in +
    score.churn * WEIGHTS.churn +
    score.conflict * WEIGHTS.conflict +
    score.coverage_gap * WEIGHTS.coverage_gap;
  storeScore(db, score);
  return score;
}

export function scoreSymbol(
  db: BobmanDatabase,
  sessionId: string,
  qname: string,
  options: ScoreOptions = {},
): RiskScore | null {
  const componentKey = `symbol:${qname}`;
  if (!options.bypassCache) {
    const cached = loadCached(db, sessionId, componentKey);
    if (cached) return cached;
  }

  const file = symbolToFile(db, sessionId, qname);
  if (!file) return null;

  const fanIn = fanInForSymbol(db, sessionId, qname);
  const { churn, conflict } = churnForFile(
    db,
    sessionId,
    file,
    options.windowDays ?? WINDOW_DAYS_DEFAULT,
  );

  const score: RiskScore = {
    session_id: sessionId,
    component_key: componentKey,
    kind: "symbol",
    fan_in: normalize(fanIn, 50),
    churn: normalize(churn, 50),
    conflict: normalize(conflict, 5),
    coverage_gap: 0,
    composite: 0,
    computed_at: nowMs(),
  };
  score.composite =
    score.fan_in * WEIGHTS.fan_in +
    score.churn * WEIGHTS.churn +
    score.conflict * WEIGHTS.conflict +
    score.coverage_gap * WEIGHTS.coverage_gap;
  storeScore(db, score);
  return score;
}

export function topRisks(
  db: BobmanDatabase,
  sessionId: string,
  limit: number,
  windowDays: number,
): RiskScore[] {
  const files = db
    .prepare(`SELECT DISTINCT rel_path FROM file_index WHERE session_id = ? AND status = 'ANALYZED'`)
    .all(sessionId) as { rel_path: string }[];
  const scores = files.map((f) =>
    scoreFile(db, sessionId, f.rel_path, { windowDays }),
  );
  scores.sort((a, b) => b.composite - a.composite);
  const out = scores.slice(0, limit);
  emitEvent(db, sessionId, "risk_scored", { count: out.length });
  return out;
}
