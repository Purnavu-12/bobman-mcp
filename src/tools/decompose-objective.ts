import { BobmanError } from "../lib/errors.js";
import { decomposeObjective } from "../lib/decompose.js";
import { DecomposeObjectiveInputSchema } from "../schemas/tool-inputs.js";
import { assertSessionState, getSession, updateSessionState } from "../state/session.js";
import type { ToolDeps } from "./deps.js";

export function handleDecomposeObjective(deps: ToolDeps, raw: unknown) {
  const input = DecomposeObjectiveInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }
  assertSessionState(session, ["INIT"], "decompose_objective");

  const graph = decomposeObjective(session.objective);

  updateSessionState(
    deps.db,
    session.session_id,
    "DECOMPOSING",
    "decompose_objective",
    "session_decomposing",
    { task_count: graph.tasks.length, edge_count: graph.edges.length },
  );

  return {
    session_id: session.session_id,
    state: "DECOMPOSING" as const,
    tasks: graph.tasks,
    edges: graph.edges,
    next_action_hint:
      "Review the decomposed tasks/edges, edit as needed, then call seed_task_graph to lock them in.",
  };
}
