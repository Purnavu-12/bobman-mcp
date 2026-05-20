import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { connectTestClient, parseToolResult } from "./_client.js";

describe("MCP server boot", () => {
  let shutdown: (() => void) | undefined;

  afterEach(() => {
    shutdown?.();
    shutdown = undefined;
  });

  it("initializes and lists all tools", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-boot-"));
    const dbPath = path.join(dir, "boot.db");
    const handle = createServer({ dbPath });
    shutdown = handle.shutdown;
    const client = await connectTestClient(handle.server);

    const init = client.getServerVersion();
    expect(init?.name).toBe("bobman-mcp");

    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "add_knowledge",
      "add_session_repo",
      "analyze_codebase",
      "analyze_repo",
      "create_session",
      "create_task_graph",
      "decompose_objective",
      "get_change_hotspots",
      "get_impact_map",
      "get_issue_context",
      "get_next_task",
      "get_pr_context",
      "get_risk_score",
      "get_session_status",
      "get_top_risks",
      "list_sessions",
      "query_events",
      "query_knowledge",
      "report_complete",
      "run_sprint_reflection",
      "seed_task_graph",
      "summarize_session",
      "validate_file_scope",
    ]);
    for (const tool of tools.tools) {
      expect(tool.description?.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeTruthy();
    }

    await client.close();
  });

  it("create_session via MCP call", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-boot2-"));
    const dbPath = path.join(dir, "boot2.db");
    const handle = createServer({ dbPath });
    shutdown = handle.shutdown;
    const client = await connectTestClient(handle.server);

    const result = await client.callTool({
      name: "create_session",
      arguments: { objective: "Integration test objective" },
    });
    const parsed = await parseToolResult<{ session_id: string; state: string }>(result);
    expect(parsed.state).toBe("INIT");
    expect(parsed.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    await client.close();
  });
});
