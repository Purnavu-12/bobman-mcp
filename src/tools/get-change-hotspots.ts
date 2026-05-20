import { BobmanError } from "../lib/errors.js";
import { enforceTokenBudget } from "../lib/token-budget.js";
import { gitIndex } from "../git/indexer.js";
import { GetChangeHotspotsInputSchema } from "../schemas/tool-inputs.js";
import { getSession } from "../state/session.js";
import type { ToolDeps } from "./deps.js";

interface HotspotRow {
  rel_path: string;
  commits: number;
  total_insertions: number;
  total_deletions: number;
  last_committed_at: number;
  unique_authors: number;
  conflict_count: number;
}

export async function handleGetChangeHotspots(deps: ToolDeps, raw: unknown) {
  const input = GetChangeHotspotsInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }

  const existing = deps.db
    .prepare(`SELECT COUNT(*) AS c FROM commits WHERE session_id = ?`)
    .get(session.session_id) as { c: number };

  let indexResult: Awaited<ReturnType<typeof gitIndex>> | null = null;
  if (existing.c === 0) {
    indexResult = await gitIndex(deps.db, session.session_id, session.repo_path, {
      windowDays: input.window_days,
    });
  }

  const windowStart = Date.now() - input.window_days * 24 * 60 * 60 * 1000;

  const rows = deps.db
    .prepare(
      `SELECT fch.rel_path AS rel_path,
              COUNT(DISTINCT fch.commit_sha) AS commits,
              COALESCE(SUM(fch.insertions), 0) AS total_insertions,
              COALESCE(SUM(fch.deletions), 0) AS total_deletions,
              MAX(c.committed_at) AS last_committed_at,
              COUNT(DISTINCT c.author_email) AS unique_authors,
              COALESCE(SUM(fch.was_conflict), 0) AS conflict_count
         FROM file_change_history fch
         JOIN commits c ON c.commit_sha = fch.commit_sha
        WHERE fch.session_id = ?
          AND c.committed_at >= ?
        GROUP BY fch.rel_path
        ORDER BY commits DESC, (total_insertions + total_deletions) DESC, rel_path ASC
        LIMIT ?`,
    )
    .all(session.session_id, windowStart, input.limit) as HotspotRow[];

  const hotspots = rows.map((r) => ({
    rel_path: r.rel_path,
    commits: r.commits,
    insertions: r.total_insertions,
    deletions: r.total_deletions,
    last_committed_at: r.last_committed_at,
    unique_authors: r.unique_authors,
    conflict_count: r.conflict_count,
  }));
  const response = {
    session_id: session.session_id,
    window_days: input.window_days,
    hotspots,
    indexed: indexResult,
  };
  return enforceTokenBudget(response).value;
}
