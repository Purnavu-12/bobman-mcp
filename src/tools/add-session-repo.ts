import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { BobmanError } from "../lib/errors.js";
import { addSessionRepo, listSessionRepos } from "../state/repos.js";
import { assertSessionState, emitEvent, getSession } from "../state/session.js";
import type { ToolDeps } from "./deps.js";

export const AddSessionRepoInputSchema = z
  .object({
    session_id: z.string().uuid(),
    abs_path: z.string().min(1),
    label: z.string().min(1).max(64).optional(),
  })
  .strip();

export function handleAddSessionRepo(deps: ToolDeps, raw: unknown) {
  const input = AddSessionRepoInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }
  assertSessionState(
    session,
    ["INIT", "DECOMPOSING", "ANALYZING", "PLANNED", "EVALUATING", "RETRYING"],
    "add_session_repo",
  );
  const resolved = path.resolve(input.abs_path);
  let stat: fs.Stats | null = null;
  try {
    stat = fs.statSync(resolved);
  } catch {
    stat = null;
  }
  if (!stat || !stat.isDirectory()) {
    throw new BobmanError("INVALID_INPUT", "abs_path must be an existing directory", {
      reason: "repo_path_invalid",
      abs_path: resolved,
    });
  }
  const repo = addSessionRepo(deps.db, session.session_id, resolved, input.label);
  emitEvent(deps.db, session.session_id, "session_repo_added", {
    repo_id: repo.repo_id,
    label: repo.label,
    abs_path: repo.abs_path,
    position: repo.position,
  });
  const repos = listSessionRepos(deps.db, session.session_id);
  return {
    session_id: session.session_id,
    repo,
    repos,
  };
}
