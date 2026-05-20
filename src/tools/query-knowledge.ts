import { BobmanError } from "../lib/errors.js";
import { enforceTokenBudget } from "../lib/token-budget.js";
import { QueryKnowledgeInputSchema } from "../schemas/tool-inputs.js";
import { getSession } from "../state/session.js";
import type { ToolDeps } from "./deps.js";

interface FtsRow {
  entry_id: number;
  kind: string;
  title: string;
  snippet: string;
  score: number;
  created_at: number;
}

function escapeFtsQuery(q: string): string {
  const cleaned = q.replace(/["\\]/g, " ").trim();
  if (cleaned.length === 0) return '""';
  if (/^[A-Za-z0-9_*\s]+$/.test(cleaned)) return cleaned;
  const tokens = cleaned
    .split(/\s+/)
    .map((t) => (t.length === 0 ? null : `"${t}"`))
    .filter((t): t is string => t !== null);
  return tokens.join(" ") || '""';
}

export function handleQueryKnowledge(deps: ToolDeps, raw: unknown) {
  const input = QueryKnowledgeInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }
  const ftsQ = escapeFtsQuery(input.q);

  let rows: FtsRow[];
  try {
    rows = deps.db
      .prepare(
        `SELECT k.entry_id AS entry_id,
                k.kind AS kind,
                k.title AS title,
                snippet(knowledge_fts, 1, '[', ']', '...', 16) AS snippet,
                bm25(knowledge_fts) AS score,
                k.created_at AS created_at
           FROM knowledge_fts
           JOIN knowledge_entries k ON k.entry_id = knowledge_fts.rowid
          WHERE knowledge_fts MATCH ?
            AND k.session_id = ?
            ${input.kind ? "AND k.kind = ?" : ""}
          ORDER BY score ASC
          LIMIT ?`,
      )
      .all(
        ...(input.kind
          ? [ftsQ, session.session_id, input.kind, input.limit]
          : [ftsQ, session.session_id, input.limit]),
      ) as FtsRow[];
  } catch (err) {
    throw new BobmanError("INVALID_INPUT", "FTS5 query failed", {
      reason: "fts5_query_invalid",
      query: input.q,
      details: err instanceof Error ? err.message : String(err),
    });
  }

  return enforceTokenBudget({
    session_id: session.session_id,
    q: input.q,
    kind: input.kind ?? null,
    entries: rows,
  }).value;
}
