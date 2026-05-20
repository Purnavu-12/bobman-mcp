import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BobmanError, toToolErrorResponse, toolSuccess } from "../lib/errors.js";
import {
  AddKnowledgeInputSchema,
  AnalyzeRepoInputSchema,
  CreateSessionInputSchema,
  DecomposeObjectiveInputSchema,
  GetChangeHotspotsInputSchema,
  GetImpactMapInputSchema,
  GetIssueContextInputSchema,
  GetNextTaskInputSchema,
  GetPrContextInputSchema,
  GetRiskScoreInputSchema,
  GetSessionStatusInputSchema,
  GetTopRisksInputSchema,
  QueryEventsInputSchema,
  QueryKnowledgeInputSchema,
  ReportCompleteInputSchema,
  SeedTaskGraphInputSchema,
  SummarizeSessionInputSchema,
  ValidateFileScopeInputSchema,
} from "../schemas/tool-inputs.js";
import { handleAddKnowledge } from "./add-knowledge.js";
import { handleAnalyzeRepo } from "./analyze-repo.js";
import { handleCreateSession } from "./create-session.js";
import { handleDecomposeObjective } from "./decompose-objective.js";
import { handleGetChangeHotspots } from "./get-change-hotspots.js";
import { handleGetImpactMap } from "./get-impact-map.js";
import { handleGetIssueContext } from "./get-issue-context.js";
import { handleGetNextTask } from "./get-next-task.js";
import { handleGetPrContext } from "./get-pr-context.js";
import { handleGetRiskScore, handleGetTopRisks } from "./get-risk-score.js";
import { handleGetSessionStatus } from "./get-session-status.js";
import { handleQueryEvents } from "./query-events.js";
import { handleQueryKnowledge } from "./query-knowledge.js";
import { handleReportComplete } from "./report-complete.js";
import { handleSeedTaskGraph } from "./seed-task-graph.js";
import { handleSummarizeSession } from "./summarize-session.js";
import { handleRunSprintReflection } from "./run-sprint-reflection.js";
import { handleListSessions, ListSessionsInputSchema } from "./list-sessions.js";
import { AddSessionRepoInputSchema, handleAddSessionRepo } from "./add-session-repo.js";
import { handleValidateFileScope } from "./validate-file-scope.js";
import type { ToolDeps } from "./deps.js";

function wrapHandler(
  deps: ToolDeps,
  handler: (deps: ToolDeps, raw: unknown) => unknown | Promise<unknown>,
) {
  return async (args: unknown) => {
    try {
      const result = await handler(deps, args);
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
    "list_sessions",
    {
      description:
        "Call this WHEN you need recent BobMan sessions from the local database (read-only). Always use before picking a session for status or reflection tools. Never mutates session state.",
      inputSchema: ListSessionsInputSchema,
    },
    wrapHandler(deps, handleListSessions),
  );

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
    "decompose_objective",
    {
      description:
        "Call this WHEN the session is INIT and you want BobMan to suggest a task DAG from the objective using a deterministic heuristic (no LLM cost). Returns tasks + edges you can edit, then pass to seed_task_graph. Always review before seeding. Never call this after the session has progressed past INIT.",
      inputSchema: DecomposeObjectiveInputSchema,
    },
    wrapHandler(deps, handleDecomposeObjective),
  );

  server.registerTool(
    "seed_task_graph",
    {
      description:
        "Call this ONCE while the session is INIT or DECOMPOSING. Seeds an ordered task DAG (tasks + dependency edges) that BobMan will dispatch one task at a time. Always include explicit acceptance_criteria per task. Never re-seed a session that has progressed past PLANNED.",
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

  server.registerTool(
    "get_change_hotspots",
    {
      description:
        "Call this WHEN you need a churn-ranked list of files changed in the repo over the last N days. Auto-indexes git history on first call per session, then aggregates commits/insertions/deletions/authors/conflicts per file. Always pass a sensible window_days (default 90). Never expect this to reach a remote — it reads only the local .git directory.",
      inputSchema: GetChangeHotspotsInputSchema,
    },
    wrapHandler(deps, handleGetChangeHotspots),
  );

  server.registerTool(
    "analyze_repo",
    {
      description:
        "Call this WHEN the session is INIT or PLANNED and you want symbols + a call graph indexed for impact-map and risk-scoring. Parses TypeScript / Python / Go / Java / Rust via WASM tree-sitter, recycles parser memory on a budget. Always invoke before get_impact_map or get_risk_score. Never call mid-task: it temporarily moves the session to ANALYZING and back.",
      inputSchema: AnalyzeRepoInputSchema,
    },
    wrapHandler(deps, handleAnalyzeRepo),
  );

  server.registerTool(
    "analyze_codebase",
    {
      description:
        "Call this WHEN you need symbols and a call graph indexed (PRD alias for analyze_repo). Always invoke before get_impact_map or get_risk_score. Never call mid-task.",
      inputSchema: AnalyzeRepoInputSchema,
    },
    wrapHandler(deps, handleAnalyzeRepo),
  );

  server.registerTool(
    "create_task_graph",
    {
      description:
        "Call this WHEN you need a PRD-style task graph draft (alias for decompose_objective). Always follow with seed_task_graph to materialize the DAG. Never skip seed_task_graph if you need get_next_task.",
      inputSchema: DecomposeObjectiveInputSchema,
    },
    wrapHandler(deps, handleDecomposeObjective),
  );

  server.registerTool(
    "get_impact_map",
    {
      description:
        "Call this WHEN you need the blast radius around a symbol or file before editing. Returns BFS-expanded callers/callees up to depth 5, deduplicated, with an automatic outer-layer collapse if the response exceeds the token budget. Always run analyze_repo first. Never use this for unrelated code-search — use a grep-style tool instead.",
      inputSchema: GetImpactMapInputSchema,
    },
    wrapHandler(deps, handleGetImpactMap),
  );

  server.registerTool(
    "get_risk_score",
    {
      description:
        "Call this WHEN you need a 0..1 composite risk score for a single file or symbol (weighted fan_in / churn / conflict / coverage_gap). Cached for 5 minutes and invalidated automatically on analyze_repo or new git history. Always pair high scores with a targeted impact map. Never treat the score as ground truth — it's a relative prioritization signal.",
      inputSchema: GetRiskScoreInputSchema,
    },
    wrapHandler(deps, handleGetRiskScore),
  );

  server.registerTool(
    "get_top_risks",
    {
      description:
        "Call this WHEN you need the top N riskiest files in the session, ranked by composite score. Iterates only ANALYZED files; respects the same cache + invalidation rules as get_risk_score. Always run analyze_repo first. Never rely on this output if the call graph or git index is empty.",
      inputSchema: GetTopRisksInputSchema,
    },
    wrapHandler(deps, handleGetTopRisks),
  );

  server.registerTool(
    "add_knowledge",
    {
      description:
        "Call this WHEN you discover a decision, constraint, fact, warning, or todo that future sessions should not have to re-derive. Persists a kind-tagged note (16 KB body cap) indexed by SQLite FTS5. Always pick a precise kind and title. Never paste secrets or credentials — the entry is stored verbatim.",
      inputSchema: AddKnowledgeInputSchema,
    },
    wrapHandler(deps, handleAddKnowledge),
  );

  server.registerTool(
    "query_knowledge",
    {
      description:
        "Call this WHEN you need prior knowledge for the current session. Runs an FTS5 MATCH and returns ranked snippets capped by the token budget. Always prefer this over re-asking the user. Never expect cross-session results — each session is isolated.",
      inputSchema: QueryKnowledgeInputSchema,
    },
    wrapHandler(deps, handleQueryKnowledge),
  );

  server.registerTool(
    "summarize_session",
    {
      description:
        "Call this WHEN you need a structured retrospective of the session: task counts, event histogram, top hotspots, risks, shipped-vs-planned, and bottleneck signals. Deterministic — no LLM. Always pair with user-facing prose if you want a narrative. Never expect cross-session aggregation.",
      inputSchema: SummarizeSessionInputSchema,
    },
    wrapHandler(deps, handleSummarizeSession),
  );

  server.registerTool(
    "run_sprint_reflection",
    {
      description:
        "Call this WHEN you need a sprint-style report since a date: planned DONE tasks vs git commits/files touched, release tags, retry and evaluation friction counts. Alias of summarize_session with the same inputs. Always run after git index or analyze_repo when you need hotspot context. Never treat as a write operation.",
      inputSchema: SummarizeSessionInputSchema,
    },
    wrapHandler(deps, handleRunSprintReflection),
  );

  server.registerTool(
    "get_pr_context",
    {
      description:
        "Call this WHEN you need the title, body, head SHA, changed files, checks, and last 10 comments of a GitHub pull request. Requires GITHUB_TOKEN in the BobMan server env. Always treat the response as read-only context. Never expect this to push or merge — it's strictly fetch.",
      inputSchema: GetPrContextInputSchema,
    },
    wrapHandler(deps, handleGetPrContext),
  );

  server.registerTool(
    "get_issue_context",
    {
      description:
        "Call this WHEN you need the title, body, labels, and last 10 comments of a GitHub issue. Requires GITHUB_TOKEN in the BobMan server env. Always cite the issue number in any follow-up commit message. Never modify issue state from BobMan; that's the agent's job through its own tools.",
      inputSchema: GetIssueContextInputSchema,
    },
    wrapHandler(deps, handleGetIssueContext),
  );

  server.registerTool(
    "add_session_repo",
    {
      description:
        "Call this WHEN the work spans multiple repos and you want a new repo attached to the current session. Always supply an absolute directory path that already exists. Never call mid-sprint: the tool refuses to mutate the repo list during IN_PROGRESS or AWAITING_REPORT.",
      inputSchema: AddSessionRepoInputSchema,
    },
    wrapHandler(deps, handleAddSessionRepo),
  );
}
