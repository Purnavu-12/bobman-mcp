import { BobmanError } from "../lib/errors.js";
import { enforceTokenBudget } from "../lib/token-budget.js";
import { summarizeSession, type SessionSummary } from "../lib/reflection.js";
import { SummarizeSessionInputSchema } from "../schemas/tool-inputs.js";
import { getSession } from "../state/session.js";
import type { ToolDeps } from "./deps.js";

export async function handleSummarizeSession(
  deps: ToolDeps,
  raw: unknown,
): Promise<SessionSummary> {
  const input = SummarizeSessionInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }
  const summary = await summarizeSession(deps.db, session.session_id, input.since);
  return enforceTokenBudget({ ...summary }).value as SessionSummary;
}
