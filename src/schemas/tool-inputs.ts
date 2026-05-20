import { z } from "zod";

const kebabTaskId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "task_id must be kebab-case");

export const CreateSessionInputSchema = z
  .object({
    objective: z.string().min(1).max(4000),
    repo_path: z.string().optional(),
  })
  .strip();

export const SeedTaskGraphInputSchema = z
  .object({
    session_id: z.string().uuid(),
    tasks: z
      .array(
        z.object({
          task_id: kebabTaskId,
          instruction: z.string().min(1).max(2000),
          acceptance_criteria: z.string().min(1).max(1000),
          file_scope: z.array(z.string().max(512)).max(50).optional(),
          estimated_complexity: z.enum(["small", "medium", "large"]).optional(),
          max_attempts: z.number().int().min(1).max(5).optional(),
        }),
      )
      .min(1)
      .max(500),
    edges: z
      .array(
        z.object({
          from: kebabTaskId,
          to: kebabTaskId,
        }),
      )
      .max(2000)
      .optional()
      .default([]),
  })
  .strip();

export const GetNextTaskInputSchema = z
  .object({
    session_id: z.string().uuid(),
  })
  .strip();

export const ReportCompleteInputSchema = z
  .object({
    session_id: z.string().uuid(),
    task_id: kebabTaskId,
    attempt: z.number().int().positive(),
    status: z.enum(["DONE", "FAILED", "BLOCKED"]),
    findings: z
      .object({
        files_changed: z.array(z.string()).optional(),
        summary: z.string().max(4000).optional(),
        notes: z.string().max(4000).optional(),
        metadata: z.record(z.unknown()).optional(),
      })
      .optional(),
    test_results: z
      .object({
        total: z.number().int().nonnegative(),
        passed: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        skipped: z.number().int().nonnegative(),
        output_excerpt: z.string().max(4000).optional(),
      })
      .optional(),
  })
  .strip();

export const GetSessionStatusInputSchema = z
  .object({
    session_id: z.string().uuid(),
  })
  .strip();
