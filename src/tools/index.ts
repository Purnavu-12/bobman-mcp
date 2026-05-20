import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BobmanError, toToolErrorResponse, toolSuccess } from "../lib/errors.js";
import {
  CreateSessionInputSchema,
  GetNextTaskInputSchema,
  GetSessionStatusInputSchema,
  ReportCompleteInputSchema,
  SeedTaskGraphInputSchema,
} from "../schemas/tool-inputs.js";
import { handleCreateSession } from "./create-session.js";
import { handleGetNextTask } from "./get-next-task.js";
import { handleGetSessionStatus } from "./get-session-status.js";
import { handleReportComplete } from "./report-complete.js";
import { handleSeedTaskGraph } from "./seed-task-graph.js";
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
        "Call this at the start of every engineering session. Creates a persisted BobMan session for an objective and repo path.",
      inputSchema: CreateSessionInputSchema,
    },
    wrapHandler(deps, handleCreateSession),
  );

  server.registerTool(
    "seed_task_graph",
    {
      description:
        "Call once after create_session while the session is INIT. Seeds an ordered task DAG (tasks + dependency edges) before execution begins.",
      inputSchema: SeedTaskGraphInputSchema,
    },
    wrapHandler(deps, handleSeedTaskGraph),
  );

  server.registerTool(
    "get_next_task",
    {
      description:
        "Call repeatedly to receive the next bounded engineering task. Returns instruction, acceptance criteria, and file paths only (never file contents).",
      inputSchema: GetNextTaskInputSchema,
    },
    wrapHandler(deps, handleGetNextTask),
  );

  server.registerTool(
    "report_complete",
    {
      description:
        "Call after finishing the current task. Submit status, findings, and test results. BobMan evaluates, advances the graph, or schedules a retry.",
      inputSchema: ReportCompleteInputSchema,
    },
    wrapHandler(deps, handleReportComplete),
  );

  server.registerTool(
    "get_session_status",
    {
      description:
        "Call anytime to resync progress: session state, task counts, in-flight task, blockers, and elapsed time.",
      inputSchema: GetSessionStatusInputSchema,
    },
    wrapHandler(deps, handleGetSessionStatus),
  );
}
