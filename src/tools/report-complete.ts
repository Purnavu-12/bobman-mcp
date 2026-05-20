import { BobmanError } from "../lib/errors.js";
import { sanitize } from "../lib/sanitize.js";
import type { SessionState } from "../schemas/persistence.js";
import { ReportCompleteInputSchema } from "../schemas/tool-inputs.js";
import { emitEvent, getSession, updateSessionState } from "../state/session.js";
import {
  cacheReportResponse,
  countPendingTasks,
  getTask,
  getTaskRun,
  markTaskDone,
  markTaskFailedTerminal,
  scheduleRetry,
} from "../state/task-graph.js";
import type { ToolDeps } from "./deps.js";

type EvaluatedStatus = "DONE" | "RETRY" | "FAILED_TERMINAL";

export function handleReportComplete(deps: ToolDeps, raw: unknown) {
  if (deps.shuttingDown?.()) {
    throw new BobmanError("INTERNAL", "Server is shutting down", {
      reason: "server_shutting_down",
    });
  }
  const input = ReportCompleteInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }

  const task = getTask(deps.db, input.task_id);
  if (!task || task.session_id !== session.session_id) {
    throw new BobmanError("NOT_FOUND", `Task not found: ${input.task_id}`, {
      entity: "task_id",
      task_id: input.task_id,
    });
  }

  const expectedAttempt = task.current_attempt > 0 ? task.current_attempt : 1;
  if (input.attempt < expectedAttempt) {
    throw new BobmanError("CONFLICT", "Stale attempt number", {
      reason: "stale_attempt",
      expected: expectedAttempt,
      received: input.attempt,
    });
  }
  if (input.attempt > expectedAttempt) {
    throw new BobmanError("CONFLICT", "Future attempt not dispatched", {
      reason: "stale_attempt",
      expected: expectedAttempt,
      received: input.attempt,
    });
  }

  const existing = getTaskRun(deps.db, input.task_id, input.attempt);
  if (existing?.reported_at != null && existing.response_json) {
    return JSON.parse(existing.response_json) as Record<string, unknown>;
  }

  if (session.state !== "AWAITING_REPORT") {
    throw new BobmanError("INVALID_TRANSITION", `Expected AWAITING_REPORT, got ${session.state}`, {
      current_state: session.state,
      attempted_action: "report_complete",
    });
  }

  updateSessionState(deps.db, session.session_id, "EVALUATING", "report_complete");

  const sanitizedFindings = input.findings ? sanitize(input.findings) : undefined;
  const sanitizedTests = input.test_results ? sanitize(input.test_results) : undefined;

  let evaluated: EvaluatedStatus;
  let overruled = false;

  if (input.status === "BLOCKED") {
    evaluated = "FAILED_TERMINAL";
    emitEvent(deps.db, session.session_id, "agent_blocked", {
      task_id: input.task_id,
      notes: (sanitizedFindings as { notes?: string })?.notes,
    });
    markTaskFailedTerminal(deps.db, getSession(deps.db, session.session_id)!, input.task_id, input.attempt);
    const response = buildResponse(session.session_id, input.task_id, input.attempt, evaluated, "BLOCKED");
    persistReport(deps.db, input.task_id, input.attempt, sanitizedFindings, sanitizedTests, response);
    return response;
  }

  const testsFailed =
    sanitizedTests &&
    typeof sanitizedTests === "object" &&
    "failed" in (sanitizedTests as object) &&
    (sanitizedTests as { failed: number }).failed > 0;

  const threshold = deps.testPassThreshold ?? 1;
  const testsBelowThreshold =
    sanitizedTests &&
    typeof sanitizedTests === "object" &&
    "passed" in (sanitizedTests as object) &&
    "total" in (sanitizedTests as object) &&
    (sanitizedTests as { passed: number; total: number }).total > 0 &&
    (sanitizedTests as { passed: number; total: number }).passed /
      (sanitizedTests as { passed: number; total: number }).total <
      threshold;

  if (input.status === "DONE" && (testsFailed || testsBelowThreshold)) {
    evaluated = "RETRY";
    overruled = true;
    const reason = testsBelowThreshold
      ? "below_test_pass_threshold"
      : "done_with_failing_tests";
    emitEvent(
      deps.db,
      session.session_id,
      testsBelowThreshold ? "evaluation_threshold_failed" : "evaluation_overruled",
      {
        task_id: input.task_id,
        attempt: input.attempt,
        reason,
        threshold,
        passed: (sanitizedTests as { passed?: number })?.passed,
        total: (sanitizedTests as { total?: number })?.total,
      },
    );
  } else if (input.status === "DONE") {
    evaluated = "DONE";
  } else {
    evaluated = input.attempt >= task.max_attempts ? "FAILED_TERMINAL" : "RETRY";
  }

  let nextState: SessionState;
  let message: string;

  if (evaluated === "DONE") {
    markTaskDone(deps.db, input.task_id);
    emitEvent(deps.db, session.session_id, "task_done", { task_id: input.task_id });
    const pending = countPendingTasks(deps.db, session.session_id);
    if (pending === 0) {
      nextState = "COMPLETE";
      message = "All tasks complete";
      updateSessionState(
        deps.db,
        session.session_id,
        "COMPLETE",
        "report_complete",
        "session_completed",
      );
    } else {
      nextState = "IN_PROGRESS";
      message = "Task done; more tasks pending";
      updateSessionState(deps.db, session.session_id, "IN_PROGRESS", "report_complete");
    }
  } else if (evaluated === "RETRY") {
    if (input.attempt >= task.max_attempts) {
      markTaskFailedTerminal(deps.db, session, input.task_id, input.attempt);
      nextState = "BLOCKED";
      message = "Max attempts exhausted";
    } else {
      const nextAttempt = input.attempt + 1;
      scheduleRetry(deps.db, task, nextAttempt);
      updateSessionState(deps.db, session.session_id, "RETRYING", "report_complete");
      nextState = "RETRYING";
      message = overruled ? "Report overruled; retry scheduled" : "Retry scheduled";
    }
  } else {
    markTaskFailedTerminal(deps.db, session, input.task_id, input.attempt);
    nextState = "BLOCKED";
    message = "Task failed terminally";
  }

  const response = buildResponse(
    session.session_id,
    input.task_id,
    input.attempt,
    evaluated,
    nextState,
    message,
  );
  persistReport(deps.db, input.task_id, input.attempt, sanitizedFindings, sanitizedTests, response);
  emitEvent(deps.db, session.session_id, "task_reported", {
    task_id: input.task_id,
    attempt: input.attempt,
    evaluated_status: evaluated,
  });
  return response;
}

function buildResponse(
  sessionId: string,
  taskId: string,
  attempt: number,
  evaluated: EvaluatedStatus,
  nextState: SessionState,
  message?: string,
) {
  return {
    session_id: sessionId,
    task_id: taskId,
    attempt,
    evaluated_status: evaluated,
    next_state: nextState,
    message: message ?? `Evaluated as ${evaluated}`,
    next_recommended_action: recommendedActionForState(nextState),
  };
}

function recommendedActionForState(state: SessionState): string {
  switch (state) {
    case "COMPLETE":
      return "Session is COMPLETE. Do not call get_next_task. Start a new session if more work is needed.";
    case "BLOCKED":
      return "Session is BLOCKED. Surface the blocker to the user and do not loop further; call get_session_status to inspect.";
    case "RETRYING":
      return "Call get_next_task to receive the retry of this task. Always re-run the tests after applying the fix.";
    case "IN_PROGRESS":
    case "AWAITING_REPORT":
    case "PLANNED":
    case "EVALUATING":
    case "INIT":
    default:
      return "Call get_next_task to continue the loop.";
  }
}

function persistReport(
  db: ToolDeps["db"],
  taskId: string,
  attempt: number,
  findings: unknown,
  testResults: unknown,
  response: Record<string, unknown>,
) {
  cacheReportResponse(
    db,
    taskId,
    attempt,
    findings ? JSON.stringify(findings) : null,
    testResults ? JSON.stringify(testResults) : null,
    JSON.stringify(response),
  );
}
