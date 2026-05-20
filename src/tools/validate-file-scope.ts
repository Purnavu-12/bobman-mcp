import { BobmanError } from "../lib/errors.js";
import { resolvePathAgainstRepo } from "../lib/path-resolve.js";
import { ValidateFileScopeInputSchema } from "../schemas/tool-inputs.js";
import { getSession } from "../state/session.js";
import type { ToolDeps } from "./deps.js";

export function handleValidateFileScope(deps: ToolDeps, raw: unknown) {
  const input = ValidateFileScopeInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }

  const resolved = input.paths.map((p) => resolvePathAgainstRepo(session.repo_path, p));

  return {
    session_id: session.session_id,
    repo_path: session.repo_path,
    resolved,
  };
}
