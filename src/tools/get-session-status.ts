import { BobmanError } from "../lib/errors.js";
import { GetSessionStatusInputSchema } from "../schemas/tool-inputs.js";
import { getSession } from "../state/session.js";
import { getInFlightRun } from "../state/task-graph.js";
import type { ToolDeps } from "./deps.js";

export function handleGetSessionStatus(deps: ToolDeps, raw: unknown) {
  const input = GetSessionStatusInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }

  const summary = deps.db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) AS done,
         SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'IN_FLIGHT' THEN 1 ELSE 0 END) AS in_flight,
         SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed
       FROM tasks WHERE session_id = ?`,
    )
    .get(session.session_id) as {
    total: number;
    done: number | null;
    pending: number | null;
    in_flight: number | null;
    failed: number | null;
  };

  const inFlightRun = getInFlightRun(deps.db, session.session_id);
  const inFlight = inFlightRun
    ? {
        task_id: inFlightRun.task_id,
        attempt: inFlightRun.attempt,
        dispatched_at: inFlightRun.dispatched_at,
      }
    : null;

  const blockerEvents = deps.db
    .prepare(
      `SELECT details_json FROM events
       WHERE session_id = ? AND type IN ('task_exhausted', 'agent_blocked', 'session_blocked')
       ORDER BY created_at DESC LIMIT 5`,
    )
    .all(session.session_id) as { details_json: string }[];

  const blockers = blockerEvents.map((e) => {
    const d = JSON.parse(e.details_json) as { task_id?: string; reason?: string };
    return {
      task_id: d.task_id ?? "unknown",
      reason: d.reason ?? "blocked",
    };
  });

  const lastEvent = deps.db
    .prepare(
      `SELECT type, created_at FROM events
       WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(session.session_id) as { type: string; created_at: number } | undefined;

  return {
    session_id: session.session_id,
    state: session.state,
    objective: session.objective,
    repo_path: session.repo_path,
    task_summary: {
      total: summary.total,
      done: summary.done ?? 0,
      pending: summary.pending ?? 0,
      in_flight: summary.in_flight ?? 0,
      failed: summary.failed ?? 0,
    },
    in_flight: inFlight,
    blockers,
    elapsed_ms: Date.now() - session.created_at,
    last_event: lastEvent
      ? { type: lastEvent.type, created_at: lastEvent.created_at }
      : null,
  };
}
