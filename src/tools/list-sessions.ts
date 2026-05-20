import { enforceTokenBudget } from "../lib/token-budget.js";
import { z } from "zod";
import type { ToolDeps } from "./deps.js";

export const ListSessionsInputSchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strip();

export function handleListSessions(deps: ToolDeps, raw: unknown) {
  const input = ListSessionsInputSchema.parse(raw);
  const limit = input.limit ?? 20;
  const rows = deps.db
    .prepare(
      `SELECT session_id, repo_path, objective, state, created_at, updated_at
         FROM sessions ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(limit) as {
    session_id: string;
    repo_path: string;
    objective: string;
    state: string;
    created_at: number;
    updated_at: number;
  }[];
  return enforceTokenBudget({ sessions: rows }).value;
}
