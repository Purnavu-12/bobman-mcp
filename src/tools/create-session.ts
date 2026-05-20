import fs from "node:fs";
import path from "node:path";
import { BobmanError } from "../lib/errors.js";
import { CreateSessionInputSchema } from "../schemas/tool-inputs.js";
import { createSession } from "../state/session.js";
import type { ToolDeps } from "./deps.js";

export function handleCreateSession(deps: ToolDeps, raw: unknown) {
  if (deps.shuttingDown?.()) {
    throw new BobmanError("INTERNAL", "Server is shutting down", {
      reason: "server_shutting_down",
    });
  }
  const input = CreateSessionInputSchema.parse(raw);
  const repoPath = path.resolve(input.repo_path ?? process.cwd());
  if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    throw new BobmanError("INVALID_INPUT", "repo_path is not a directory", {
      reason: "repo_path_not_directory",
      repo_path: repoPath,
    });
  }
  const session = createSession(deps.db, input.objective, repoPath);
  return {
    session_id: session.session_id,
    state: session.state,
    repo_path: session.repo_path,
  };
}
