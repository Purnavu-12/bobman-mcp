import { BobmanError } from "../lib/errors.js";
import { enforceTokenBudget } from "../lib/token-budget.js";
import { GetNextTaskInputSchema } from "../schemas/tool-inputs.js";
import { emitEvent, getSession, updateSessionState } from "../state/session.js";
import {
  dispatchTask,
  getInFlightRun,
  getTask,
  hasEligiblePendingButBlocked,
  pickNextEligibleTask,
} from "../state/task-graph.js";
import type { ToolDeps } from "./deps.js";

export function handleGetNextTask(deps: ToolDeps, raw: unknown) {
  if (deps.shuttingDown?.()) {
    throw new BobmanError("INTERNAL", "Server is shutting down", {
      reason: "server_shutting_down",
    });
  }
  const input = GetNextTaskInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }

  if (session.state === "COMPLETE" || session.state === "BLOCKED") {
    throw new BobmanError("INVALID_TRANSITION", `Session is terminal: ${session.state}`, {
      current_state: session.state,
      attempted_action: "get_next_task",
    });
  }

  if (session.state === "AWAITING_REPORT") {
    const inFlight = getInFlightRun(deps.db, session.session_id);
    if (!inFlight) {
      throw new BobmanError("INTERNAL", "AWAITING_REPORT but no in-flight task", {
        session_id: session.session_id,
      });
    }
    const task = getTask(deps.db, inFlight.task_id);
    if (!task) {
      throw new BobmanError("NOT_FOUND", `Task not found: ${inFlight.task_id}`, {
        entity: "task_id",
      });
    }
    const response = buildTaskResponse(session.session_id, task, inFlight.attempt, true);
    return enforceTokenBudget(response).value;
  }

  if (session.state === "PLANNED") {
    updateSessionState(deps.db, session.session_id, "IN_PROGRESS", "get_next_task");
  } else if (session.state === "RETRYING" || session.state === "IN_PROGRESS") {
    // continue to dispatch
  } else if (session.state !== "IN_PROGRESS") {
    throw new BobmanError("INVALID_TRANSITION", `Cannot get_next_task from ${session.state}`, {
      current_state: session.state,
      attempted_action: "get_next_task",
    });
  }

  const fresh = getSession(deps.db, input.session_id)!;
  const next = pickNextEligibleTask(deps.db, fresh.session_id);
  if (!next) {
    if (hasEligiblePendingButBlocked(deps.db, fresh.session_id)) {
      throw new BobmanError("CONFLICT", "Tasks blocked by dependencies", {
        reason: "blocked_by_dependencies",
      });
    }
    throw new BobmanError("CONFLICT", "No pending tasks remain", {
      reason: "no_pending_tasks",
    });
  }

  const attempt = next.current_attempt > 0 ? next.current_attempt : 1;
  dispatchTask(deps.db, next, attempt);
  updateSessionState(deps.db, fresh.session_id, "AWAITING_REPORT", "get_next_task");
  emitEvent(deps.db, fresh.session_id, "task_dispatched", {
    task_id: next.task_id,
    attempt,
  });

  const response = buildTaskResponse(fresh.session_id, next, attempt, false);
  return enforceTokenBudget(response).value;
}

function buildTaskResponse(
  sessionId: string,
  task: {
    task_id: string;
    instruction: string;
    acceptance_criteria: string;
    file_scope_json: string;
    estimated_complexity: string;
  },
  attempt: number,
  resume: boolean,
) {
  const fileScope = JSON.parse(task.file_scope_json) as string[];
  return {
    session_id: sessionId,
    task_id: task.task_id,
    attempt,
    instruction: task.instruction,
    acceptance_criteria: task.acceptance_criteria,
    file_scope: fileScope,
    estimated_complexity: task.estimated_complexity as "small" | "medium" | "large",
    hints: resume ? { resume: true } : undefined,
    state: "AWAITING_REPORT" as const,
  };
}
