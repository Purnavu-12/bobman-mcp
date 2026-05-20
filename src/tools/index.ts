import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BobmanError, toToolErrorResponse, toolSuccess } from "../lib/errors.js";
import {
  CreateSessionInputSchema,
  GetNextTaskInputSchema,
  GetSessionStatusInputSchema,
  QueryEventsInputSchema,
  ReportCompleteInputSchema,
  SeedTaskGraphInputSchema,
  ValidateFileScopeInputSchema,
} from "../schemas/tool-inputs.js";
import { handleCreateSession } from "./create-session.js";
import { handleGetNextTask } from "./get-next-task.js";
import { handleGetSessionStatus } from "./get-session-status.js";
import { handleQueryEvents } from "./query-events.js";
import { handleReportComplete } from "./report-complete.js";
import { handleSeedTaskGraph } from "./seed-task-graph.js";
import { handleValidateFileScope } from "./validate-file-scope.js";
import type { ToolDeps } from "./deps.js";

function wrapHandler(deps: ToolDeps, handler: (deps: ToolDeps, raw: unknown) => unknown) {
  return async (args: unknown) => {
    try {
      const result = handler(deps, args);
      return toolSuccess(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return toToolErrorResponse(
          new BobmanError("INVALID_INPUT", "Invalid tool input", { issues: err.issues }),
        );
      }
      return toToolErrorResponse(err);
    }
  };
}

export function registerAllTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "create_session",
    {
      description:
        "Call this BEFORE any multi-step engineering work in this repo. Creates a persisted BobMan session and returns its session_id. Always pass the user's actual objective verbatim. Never invent or rephrase the objective.",
      inputSchema: CreateSessionInputSchema,
    },
    wrapHandler(deps, handleCreateSession),
  );

  server.registerTool(
    "seed_task_graph",
    {
      description:
        "Call this ONCE right after create_session while the session is INIT. Seeds an ordered task DAG (tasks + dependency edges) that BobMan will dispatch one task at a time. Always include explicit acceptance_criteria per task. Never re-seed a session that has progressed past INIT.",
      inputSchema: SeedTaskGraphInputSchema,
    },
    wrapHandler(deps, handleSeedTaskGraph),
  );

  server.registerTool(
    "get_next_task",
    {
      description:
        "Call this WHENEVER you need the next concrete instruction. Do not propose tasks yourself. Returns instruction, acceptance criteria, and file paths only (never file contents). Always honor the returned file_scope_status before editing. Never skip ahead to a different task.",
      inputSchema: GetNextTaskInputSchema,
    },
    wrapHandler(deps, handleGetNextTask),
  );

  server.registerTool(
    "report_complete",
    {
      description:
        "Call this IMMEDIATELY after finishing the current task's work. Submit status (DONE/FAILED/BLOCKED), findings, and test_results. Always include test_results when any tests were run in this session. Never call report_complete if you skipped the task — call get_next_task instead.",
      inputSchema: ReportCompleteInputSchema,
    },
    wrapHandler(deps, handleReportComplete),
  );

  server.registerTool(
    "get_session_status",
    {
      description:
        "Call this ANYTIME you need to resync without dispatching work. Returns session state, task counts, in-flight task, blockers, and elapsed time. Always read the recommendation field before deciding the next call. Never use this in place of get_next_task to advance the loop.",
      inputSchema: GetSessionStatusInputSchema,
    },
    wrapHandler(deps, handleGetSessionStatus),
  );

  server.registerTool(
    "validate_file_scope",
    {
      description:
        "Call this BEFORE editing files when you are unsure a hinted path exists. Resolves up to 50 paths against the session repo and returns existence + kind per entry. Always trust the returned kind over your own assumptions. Never use this to read file contents — it only stats paths.",
      inputSchema: ValidateFileScopeInputSchema,
    },
    wrapHandler(deps, handleValidateFileScope),
  );

  server.registerTool(
    "query_events",
    {
      description:
        "Call this WHEN you need to inspect what BobMan recorded for a session: dispatches, evaluations, retries, blockers. Filters by type[], since (epoch ms), and limit (max 500). Always read events oldest-first. Never call this in a tight loop — use get_session_status for live state.",
      inputSchema: QueryEventsInputSchema,
    },
    wrapHandler(deps, handleQueryEvents),
  );
}
