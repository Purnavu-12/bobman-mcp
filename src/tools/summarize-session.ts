import { BobmanError } from "../lib/errors.js";
import { enforceTokenBudget } from "../lib/token-budget.js";
import { summarizeSession } from "../lib/reflection.js";
import { SummarizeSessionInputSchema } from "../schemas/tool-inputs.js";
import { getSession } from "../state/session.js";
import type { ToolDeps } from "./deps.js";

export function handleSummarizeSession(deps: ToolDeps, raw: unknown) {
  const input = SummarizeSessionInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }
  const summary = summarizeSession(deps.db, session.session_id, input.since);
  return enforceTokenBudget(summary).value;
}
