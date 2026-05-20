import { z } from "zod";
import { SessionStateSchema } from "./persistence.js";

export const CreateSessionOutputSchema = z.object({
  session_id: z.string().uuid(),
  state: z.literal("INIT"),
  repo_path: z.string(),
});

export const SeedTaskGraphOutputSchema = z.object({
  graph_id: z.string(),
  task_count: z.number(),
  edge_count: z.number(),
  state: z.literal("PLANNED"),
});

export const GetNextTaskOutputSchema = z.object({
  session_id: z.string().uuid(),
  task_id: z.string(),
  attempt: z.number(),
  instruction: z.string(),
  acceptance_criteria: z.string(),
  file_scope: z.array(z.string()),
  estimated_complexity: z.enum(["small", "medium", "large"]),
  hints: z
    .object({
      resume: z.boolean().optional(),
      prior_failure_reason: z.string().optional(),
    })
    .optional(),
  state: z.literal("AWAITING_REPORT"),
  truncated: z
    .object({
      file_scope_dropped: z.number(),
      original_count: z.number(),
    })
    .optional(),
});

export const ReportCompleteOutputSchema = z.object({
  session_id: z.string().uuid(),
  task_id: z.string(),
  attempt: z.number(),
  evaluated_status: z.enum(["DONE", "RETRY", "FAILED_TERMINAL"]),
  next_state: SessionStateSchema,
  message: z.string(),
});

export const GetSessionStatusOutputSchema = z.object({
  session_id: z.string().uuid(),
  state: SessionStateSchema,
  objective: z.string(),
  repo_path: z.string(),
  task_summary: z.object({
    total: z.number(),
    done: z.number(),
    pending: z.number(),
    in_flight: z.number(),
    failed: z.number(),
  }),
  in_flight: z
    .object({
      task_id: z.string(),
      attempt: z.number(),
      dispatched_at: z.number(),
    })
    .nullable(),
  blockers: z.array(
    z.object({
      task_id: z.string(),
      reason: z.string(),
    }),
  ),
  elapsed_ms: z.number(),
  last_event: z
    .object({
      type: z.string(),
      created_at: z.number(),
    })
    .nullable(),
});
