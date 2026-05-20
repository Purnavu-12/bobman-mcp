import { handleSummarizeSession } from "./summarize-session.js";
import type { ToolDeps } from "./deps.js";

/** PRD alias for `summarize_session` (F-10). */
export async function handleRunSprintReflection(deps: ToolDeps, raw: unknown) {
  return handleSummarizeSession(deps, raw);
}
