import { BobmanError } from "../lib/errors.js";
import {
  coverageGapForFile,
  ingestCoverageForSession,
} from "../lib/coverage.js";
import { formatRiskScore } from "../lib/risk-format.js";
import { enforceTokenBudget } from "../lib/token-budget.js";
import { listSessionRepos } from "../state/repos.js";
import { scoreFile, scoreSymbol } from "../risk/score.js";
import {
  GetRiskScoreInputSchema,
  GetTopRisksInputSchema,
} from "../schemas/tool-inputs.js";
import { topRisks } from "../risk/score.js";
import { getSession } from "../state/session.js";
import type { ToolDeps } from "./deps.js";

export function handleGetRiskScore(deps: ToolDeps, raw: unknown) {
  const input = GetRiskScoreInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }
  ensureCoverageLoaded(deps, session.session_id);

  const score =
    input.kind === "file"
      ? scoreFile(deps.db, session.session_id, input.component, {
          windowDays: input.window_days,
        })
      : scoreSymbol(deps.db, session.session_id, input.component, {
          windowDays: input.window_days,
        });
  if (!score) {
    return {
      session_id: session.session_id,
      component: input.component,
      kind: input.kind,
      found: false,
      hint: "Symbol not indexed. Call analyze_repo first.",
    };
  }
  const fileRel =
    input.kind === "file"
      ? input.component
      : (deps.db
          .prepare(
            `SELECT f.rel_path FROM symbols s
               JOIN file_index f ON f.file_id = s.file_id
              WHERE f.session_id = ? AND s.qualified_name = ? LIMIT 1`,
          )
          .get(session.session_id, input.component) as { rel_path: string } | undefined)
          ?.rel_path;
  const covMeta = fileRel
    ? coverageGapForFile(deps.db, session.session_id, fileRel)
    : { lines_pct: null as number | null, has_data: false, gap: score.coverage_gap };
  const formatted = formatRiskScore(score, {
    lines_pct: covMeta.lines_pct,
    has_data: covMeta.has_data,
  });
  return enforceTokenBudget({ session_id: session.session_id, ...formatted }).value;
}

function ensureCoverageLoaded(deps: ToolDeps, sessionId: string): void {
  const row = deps.db
    .prepare(`SELECT COUNT(*) AS c FROM coverage_snapshot WHERE session_id = ?`)
    .get(sessionId) as { c: number };
  if (row.c > 0) return;
  const repos = listSessionRepos(deps.db, sessionId);
  ingestCoverageForSession(deps.db, sessionId, repos, deps.coveragePaths ?? []);
}

export function handleGetTopRisks(deps: ToolDeps, raw: unknown) {
  const input = GetTopRisksInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }
  ensureCoverageLoaded(deps, session.session_id);
  const items = topRisks(deps.db, session.session_id, input.limit, input.window_days);
  const formatted = items.map((s) => {
    const rel = s.component_key.startsWith("file:") ? s.component_key.slice(5) : "";
    const cov = rel ? coverageGapForFile(deps.db, session.session_id, rel) : null;
    return formatRiskScore(s, cov ?? undefined);
  });
  return enforceTokenBudget({
    session_id: session.session_id,
    window_days: input.window_days,
    items: formatted,
  }).value;
}
