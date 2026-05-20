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

export const ValidateFileScopeInputSchema = z
  .object({
    session_id: z.string().uuid(),
    paths: z.array(z.string().min(1).max(512)).min(1).max(50),
  })
  .strip();

export const QueryEventsInputSchema = z
  .object({
    session_id: z.string().uuid(),
    types: z.array(z.string().min(1).max(64)).max(50).optional(),
    since: z.number().int().nonnegative().optional(),
    limit: z.number().int().min(1).max(500).optional().default(100),
  })
  .strip();

export const DecomposeObjectiveInputSchema = z
  .object({
    session_id: z.string().uuid(),
  })
  .strip();

export const GetChangeHotspotsInputSchema = z
  .object({
    session_id: z.string().uuid(),
    window_days: z.number().int().min(1).max(730).optional().default(90),
    limit: z.number().int().min(1).max(100).optional().default(10),
  })
  .strip();

export const AnalyzeRepoInputSchema = z
  .object({
    session_id: z.string().uuid(),
    paths: z.array(z.string().min(1).max(512)).max(500).optional(),
    force: z.boolean().optional().default(false),
  })
  .strip();

export const GetImpactMapInputSchema = z
  .object({
    session_id: z.string().uuid(),
    target: z.string().min(1).max(512),
    direction: z.enum(["callers", "callees", "both"]).optional().default("both"),
    depth: z.number().int().min(1).max(5).optional().default(2),
  })
  .strip();

export const GetRiskScoreInputSchema = z
  .object({
    session_id: z.string().uuid(),
    component: z.string().min(1).max(512),
    kind: z.enum(["file", "symbol"]).optional().default("file"),
    window_days: z.number().int().min(1).max(730).optional().default(90),
  })
  .strip();

export const GetTopRisksInputSchema = z
  .object({
    session_id: z.string().uuid(),
    limit: z.number().int().min(1).max(50).optional().default(10),
    window_days: z.number().int().min(1).max(730).optional().default(90),
  })
  .strip();

export const AddKnowledgeInputSchema = z
  .object({
    session_id: z.string().uuid(),
    kind: z.enum(["decision", "constraint", "fact", "warning", "todo"]),
    title: z.string().min(1).max(256),
    body: z.string().min(1).max(16384),
    source_ref: z.string().min(1).max(512).optional(),
  })
  .strip();

export const QueryKnowledgeInputSchema = z
  .object({
    session_id: z.string().uuid(),
    q: z.string().min(1).max(512),
    kind: z.enum(["decision", "constraint", "fact", "warning", "todo"]).optional(),
    limit: z.number().int().min(1).max(50).optional().default(10),
  })
  .strip();

export const SummarizeSessionInputSchema = z
  .object({
    session_id: z.string().uuid(),
    since: z.number().int().nonnegative().optional(),
  })
  .strip();

export const GetPrContextInputSchema = z
  .object({
    session_id: z.string().uuid(),
    owner: z.string().min(1).max(128),
    repo: z.string().min(1).max(128),
    pr_number: z.number().int().positive(),
  })
  .strip();

export const GetIssueContextInputSchema = z
  .object({
    session_id: z.string().uuid(),
    owner: z.string().min(1).max(128),
    repo: z.string().min(1).max(128),
    issue_number: z.number().int().positive(),
  })
  .strip();
