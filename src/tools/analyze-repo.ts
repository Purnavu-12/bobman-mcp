import { BobmanError } from "../lib/errors.js";
import { analyzeRepo } from "../analyzer/manager.js";
import { AnalyzeRepoInputSchema } from "../schemas/tool-inputs.js";
import { getSession, updateSessionState } from "../state/session.js";
import type { ToolDeps } from "./deps.js";

export async function handleAnalyzeRepo(deps: ToolDeps, raw: unknown) {
  const input = AnalyzeRepoInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }
  const allowedSources = ["INIT", "PLANNED"] as const;
  if (!allowedSources.includes(session.state as (typeof allowedSources)[number])) {
    throw new BobmanError(
      "INVALID_TRANSITION",
      `Cannot analyze_repo from ${session.state}`,
      { current_state: session.state, attempted_action: "analyze_repo" },
    );
  }
  const original = session.state;

  updateSessionState(
    deps.db,
    session.session_id,
    "ANALYZING",
    "analyze_repo",
    "session_analyzing",
    { from: original },
  );

  let summary;
  try {
    summary = await analyzeRepo(deps.db, session.session_id, session.repo_path, {
      paths: input.paths,
      force: input.force,
    });
  } catch (err) {
    updateSessionState(
      deps.db,
      session.session_id,
      "BLOCKED",
      "analyze_repo",
      "session_blocked",
      { reason: "analyzer_failed", error: String(err) },
    );
    throw err;
  }

  updateSessionState(
    deps.db,
    session.session_id,
    original,
    "analyze_repo",
    "session_analyzed",
    { restored_to: original },
  );

  return {
    session_id: session.session_id,
    state: original,
    ...summary,
  };
}
