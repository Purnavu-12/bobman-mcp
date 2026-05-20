import { z } from "zod";

export const SessionStateSchema = z.enum([
  "INIT",
  "ANALYZING",
  "PLANNED",
  "IN_PROGRESS",
  "AWAITING_REPORT",
  "EVALUATING",
  "RETRYING",
  "BLOCKED",
  "COMPLETE",
]);

export type SessionState = z.infer<typeof SessionStateSchema>;

export const TaskStatusSchema = z.enum([
  "PENDING",
  "IN_FLIGHT",
  "DONE",
  "FAILED",
  "RETRY_PENDING",
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const SessionRowSchema = z.object({
  session_id: z.string(),
  repo_path: z.string(),
  objective: z.string(),
  state: SessionStateSchema,
  created_at: z.number(),
  updated_at: z.number(),
});

export type SessionRow = z.infer<typeof SessionRowSchema>;

export const TaskRowSchema = z.object({
  task_id: z.string(),
  session_id: z.string(),
  instruction: z.string(),
  file_scope_json: z.string(),
  acceptance_criteria: z.string(),
  estimated_complexity: z.enum(["small", "medium", "large"]),
  max_attempts: z.number(),
  current_attempt: z.number(),
  status: TaskStatusSchema,
  created_at: z.number(),
});

export type TaskRow = z.infer<typeof TaskRowSchema>;

export const EdgeRowSchema = z.object({
  session_id: z.string(),
  from_task_id: z.string(),
  to_task_id: z.string(),
});

export type EdgeRow = z.infer<typeof EdgeRowSchema>;

export const TaskRunRowSchema = z.object({
  task_id: z.string(),
  attempt: z.number(),
  status: z.string(),
  findings_json: z.string().nullable(),
  test_results_json: z.string().nullable(),
  response_json: z.string().nullable(),
  dispatched_at: z.number(),
  reported_at: z.number().nullable(),
});

export type TaskRunRow = z.infer<typeof TaskRunRowSchema>;

export const EventRowSchema = z.object({
  event_id: z.number(),
  session_id: z.string(),
  type: z.string(),
  details_json: z.string(),
  created_at: z.number(),
});

export type EventRow = z.infer<typeof EventRowSchema>;

export const FindingsSchema = z
  .object({
    files_changed: z.array(z.string()).optional(),
    summary: z.string().max(4000).optional(),
    notes: z.string().max(4000).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .optional();

export const TestResultsSchema = z
  .object({
    total: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    output_excerpt: z.string().max(4000).optional(),
  })
  .optional();
