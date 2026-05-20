import type { BobmanDatabase } from "./db.js";
import { nowMs } from "./db.js";
import { BobmanError } from "../lib/errors.js";
import type { SessionRow, TaskRow } from "../schemas/persistence.js";
import { emitEvent, updateSessionState } from "./session.js";

export const MAX_TASKS = 500;
export const MAX_EDGES = 2000;

export interface SeedTaskInput {
  task_id: string;
  instruction: string;
  acceptance_criteria: string;
  file_scope?: string[];
  estimated_complexity?: "small" | "medium" | "large";
  max_attempts?: number;
}

export interface SeedEdgeInput {
  from: string;
  to: string;
}

function detectCycle(taskIds: Set<string>, edges: SeedEdgeInput[]): string[] | null {
  const adj = new Map<string, string[]>();
  for (const id of taskIds) {
    adj.set(id, []);
  }
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
  }

  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  const dfs = (node: string): string[] | null => {
    visited.add(node);
    stack.add(node);
    path.push(node);
    for (const next of adj.get(node) ?? []) {
      if (!visited.has(next)) {
        const found = dfs(next);
        if (found) return found;
      } else if (stack.has(next)) {
        const idx = path.indexOf(next);
        return [...path.slice(idx), next];
      }
    }
    path.pop();
    stack.delete(node);
    return null;
  };

  for (const id of taskIds) {
    if (!visited.has(id)) {
      const cycle = dfs(id);
      if (cycle) return cycle;
    }
  }
  return null;
}

export function validateSeedInput(
  tasks: SeedTaskInput[],
  edges: SeedEdgeInput[] = [],
): void {
  if (tasks.length === 0) {
    throw new BobmanError("INVALID_INPUT", "Task graph cannot be empty", {
      reason: "empty_graph",
    });
  }
  if (tasks.length > MAX_TASKS) {
    throw new BobmanError("INVALID_INPUT", "Too many tasks", {
      reason: "too_many_tasks",
      limit: MAX_TASKS,
    });
  }
  if (edges.length > MAX_EDGES) {
    throw new BobmanError("INVALID_INPUT", "Too many edges", {
      reason: "too_many_edges",
      limit: MAX_EDGES,
    });
  }

  const ids = new Set<string>();
  for (const t of tasks) {
    if (ids.has(t.task_id)) {
      throw new BobmanError("INVALID_INPUT", "Duplicate task_id", {
        reason: "duplicate_task_id",
        task_id: t.task_id,
      });
    }
    ids.add(t.task_id);
  }

  for (const e of edges) {
    if (e.from === e.to) {
      throw new BobmanError("INVALID_INPUT", "Self-loop edge", { reason: "self_loop", edge: e });
    }
    if (!ids.has(e.from) || !ids.has(e.to)) {
      throw new BobmanError("INVALID_INPUT", "Edge references unknown task", {
        reason: "edge_references_unknown_task",
        edge: e,
      });
    }
  }

  const cycle = detectCycle(ids, edges);
  if (cycle) {
    throw new BobmanError("INVALID_INPUT", "Task graph contains a cycle", { cycle });
  }
}

export function seedTaskGraph(
  db: BobmanDatabase,
  session: SessionRow,
  tasks: SeedTaskInput[],
  edges: SeedEdgeInput[],
): { graph_id: string; task_count: number; edge_count: number } {
  validateSeedInput(tasks, edges);
  const graphId = `${session.session_id}-graph`;
  const ts = nowMs();

  const insert = db.transaction(() => {
    for (const t of tasks) {
      db.prepare(
        `INSERT INTO tasks (
          task_id, session_id, instruction, file_scope_json, acceptance_criteria,
          estimated_complexity, max_attempts, current_attempt, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', ?)`,
      ).run(
        t.task_id,
        session.session_id,
        t.instruction,
        JSON.stringify(t.file_scope ?? []),
        t.acceptance_criteria,
        t.estimated_complexity ?? "medium",
        t.max_attempts ?? 3,
        ts,
      );
    }
    for (const e of edges) {
      db.prepare(
        `INSERT INTO task_edges (session_id, from_task_id, to_task_id) VALUES (?, ?, ?)`,
      ).run(session.session_id, e.from, e.to);
    }
  });
  insert();

  emitEvent(db, session.session_id, "graph_seeded", {
    graph_id: graphId,
    task_count: tasks.length,
    edge_count: edges.length,
  });

  return { graph_id: graphId, task_count: tasks.length, edge_count: edges.length };
}

export function getTask(db: BobmanDatabase, taskId: string): TaskRow | null {
  const row = db
    .prepare(
      `SELECT task_id, session_id, instruction, file_scope_json, acceptance_criteria,
              estimated_complexity, max_attempts, current_attempt, status, created_at
       FROM tasks WHERE task_id = ?`,
    )
    .get(taskId) as TaskRow | undefined;
  return row ?? null;
}

export function countPendingTasks(db: BobmanDatabase, sessionId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM tasks WHERE session_id = ? AND status = 'PENDING'`)
    .get(sessionId) as { c: number };
  return row.c;
}

function prerequisitesDone(db: BobmanDatabase, taskId: string): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM task_edges e
       JOIN tasks t ON t.task_id = e.from_task_id
       WHERE e.to_task_id = ? AND t.status != 'DONE'`,
    )
    .get(taskId) as { c: number };
  return row.c === 0;
}

export function pickNextEligibleTask(db: BobmanDatabase, sessionId: string): TaskRow | null {
  const pending = db
    .prepare(
      `SELECT task_id, session_id, instruction, file_scope_json, acceptance_criteria,
              estimated_complexity, max_attempts, current_attempt, status, created_at
       FROM tasks
       WHERE session_id = ? AND status = 'PENDING'
       ORDER BY created_at ASC, task_id ASC`,
    )
    .all(sessionId) as TaskRow[];

  for (const task of pending) {
    if (prerequisitesDone(db, task.task_id)) {
      return task;
    }
  }
  return null;
}

export interface InFlightRun {
  task_id: string;
  attempt: number;
  dispatched_at: number;
}

export function getInFlightRun(db: BobmanDatabase, sessionId: string): InFlightRun | null {
  const row = db
    .prepare(
      `SELECT tr.task_id, tr.attempt, tr.dispatched_at
       FROM task_runs tr
       JOIN tasks t ON t.task_id = tr.task_id
       WHERE t.session_id = ? AND tr.status = 'DISPATCHED' AND tr.reported_at IS NULL
       ORDER BY tr.dispatched_at DESC
       LIMIT 1`,
    )
    .get(sessionId) as InFlightRun | undefined;
  return row ?? null;
}

export function dispatchTask(
  db: BobmanDatabase,
  task: TaskRow,
  attempt: number,
): void {
  db.prepare(`UPDATE tasks SET status = 'IN_FLIGHT', current_attempt = ? WHERE task_id = ?`).run(
    attempt,
    task.task_id,
  );
  db.prepare(
    `INSERT INTO task_runs (task_id, attempt, status, dispatched_at)
     VALUES (?, ?, 'DISPATCHED', ?)
     ON CONFLICT(task_id, attempt) DO NOTHING`,
  ).run(task.task_id, attempt, nowMs());
}

export function getTaskRun(
  db: BobmanDatabase,
  taskId: string,
  attempt: number,
): {
  status: string;
  findings_json: string | null;
  test_results_json: string | null;
  response_json: string | null;
  reported_at: number | null;
} | null {
  const row = db
    .prepare(
      `SELECT status, findings_json, test_results_json, response_json, reported_at
       FROM task_runs WHERE task_id = ? AND attempt = ?`,
    )
    .get(taskId, attempt) as
    | {
        status: string;
        findings_json: string | null;
        test_results_json: string | null;
        response_json: string | null;
        reported_at: number | null;
      }
    | undefined;
  return row ?? null;
}

export function cacheReportResponse(
  db: BobmanDatabase,
  taskId: string,
  attempt: number,
  findingsJson: string | null,
  testResultsJson: string | null,
  responseJson: string,
): void {
  db.prepare(
    `UPDATE task_runs SET status = 'REPORTED', findings_json = ?, test_results_json = ?,
     response_json = ?, reported_at = ?
     WHERE task_id = ? AND attempt = ?`,
  ).run(findingsJson, testResultsJson, responseJson, nowMs(), taskId, attempt);
}

export function markTaskDone(db: BobmanDatabase, taskId: string): void {
  db.prepare(`UPDATE tasks SET status = 'DONE' WHERE task_id = ?`).run(taskId);
}

export function scheduleRetry(db: BobmanDatabase, task: TaskRow, nextAttempt: number): void {
  db.prepare(`UPDATE tasks SET status = 'PENDING', current_attempt = ? WHERE task_id = ?`).run(
    nextAttempt,
    task.task_id,
  );
  db.prepare(
    `INSERT INTO task_runs (task_id, attempt, status, dispatched_at)
     VALUES (?, ?, 'RETRY_QUEUED', ?)`,
  ).run(task.task_id, nextAttempt, nowMs());
  emitEvent(db, task.session_id, "retry_queued", {
    task_id: task.task_id,
    attempt: nextAttempt,
  });
}

export function markTaskFailedTerminal(
  db: BobmanDatabase,
  session: SessionRow,
  taskId: string,
  attempts: number,
): void {
  db.prepare(`UPDATE tasks SET status = 'FAILED' WHERE task_id = ?`).run(taskId);
  emitEvent(db, session.session_id, "task_exhausted", { task_id: taskId, attempts });
  updateSessionState(db, session.session_id, "BLOCKED", "task_exhausted", "session_blocked", {
    task_id: taskId,
    reason: "max_attempts_exhausted",
  });
}

export function hasEligiblePendingButBlocked(db: BobmanDatabase, sessionId: string): boolean {
  const pendingCount = countPendingTasks(db, sessionId);
  if (pendingCount === 0) return false;
  return pickNextEligibleTask(db, sessionId) === null;
}
