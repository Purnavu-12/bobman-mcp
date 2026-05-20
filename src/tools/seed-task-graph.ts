import { BobmanError } from "../lib/errors.js";
import { resolveAgainstRepos } from "../lib/path-resolve.js";
import { SeedTaskGraphInputSchema } from "../schemas/tool-inputs.js";
import { listSessionRepos } from "../state/repos.js";
import { assertSessionState, getSession, updateSessionState } from "../state/session.js";
import { seedTaskGraph } from "../state/task-graph.js";
import type { ToolDeps } from "./deps.js";

export function handleSeedTaskGraph(deps: ToolDeps, raw: unknown) {
  if (deps.shuttingDown?.()) {
    throw new BobmanError("INTERNAL", "Server is shutting down", {
      reason: "server_shutting_down",
    });
  }
  const input = SeedTaskGraphInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }
  assertSessionState(session, ["INIT", "DECOMPOSING"], "seed_task_graph");

  if (deps.strictFileScope) {
    const repos = listSessionRepos(deps.db, session.session_id);
    const missing: { task_id: string; path: string; error?: string }[] = [];
    for (const t of input.tasks) {
      for (const p of t.file_scope ?? []) {
        const r = resolveAgainstRepos(repos, p);
        if (!r.exists) {
          missing.push({
            task_id: t.task_id,
            path: p,
            error: r.error,
            matching_repos: r.matching_repos,
          });
        }
      }
    }
    if (missing.length > 0) {
      const ambiguous = missing.filter((m) => m.error === "ambiguous_path");
      if (ambiguous.length > 0) {
        throw new BobmanError("CONFLICT", "file_scope path exists in multiple repos; use label::path", {
          reason: "ambiguous_path",
          paths: ambiguous,
        });
      }
      throw new BobmanError("INVALID_INPUT", "file_scope contains missing paths", {
        reason: "file_scope_missing",
        missing,
      });
    }
  }

  const result = seedTaskGraph(
    deps.db,
    session,
    input.tasks,
    input.edges ?? [],
    deps.defaultMaxAttempts ?? 3,
  );
  updateSessionState(
    deps.db,
    session.session_id,
    "PLANNED",
    "seed_task_graph",
    "session_planned",
    result,
  );

  return {
    graph_id: result.graph_id,
    task_count: result.task_count,
    edge_count: result.edge_count,
    state: "PLANNED" as const,
  };
}
