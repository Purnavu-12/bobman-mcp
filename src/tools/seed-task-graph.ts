import { BobmanError } from "../lib/errors.js";
import { SeedTaskGraphInputSchema } from "../schemas/tool-inputs.js";
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
  assertSessionState(session, ["INIT"], "seed_task_graph");

  const result = seedTaskGraph(deps.db, session, input.tasks, input.edges ?? []);
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
