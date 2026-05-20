import { BobmanError } from "../lib/errors.js";
import { enforceTokenBudget } from "../lib/token-budget.js";
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
  return enforceTokenBudget({ session_id: session.session_id, ...score }).value;
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
  const items = topRisks(deps.db, session.session_id, input.limit, input.window_days);
  return enforceTokenBudget({
    session_id: session.session_id,
    window_days: input.window_days,
    items,
  }).value;
}
