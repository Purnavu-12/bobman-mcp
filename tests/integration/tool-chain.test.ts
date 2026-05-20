import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { connectTestClient, parseToolResult } from "./_client.js";

describe("F-09 tool chain", () => {
  let shutdown: (() => void) | undefined;

  afterEach(() => {
    shutdown?.();
    shutdown = undefined;
  });

  it("analyze_repo → get_impact_map → get_top_risks", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-chain-"));
    const srcDir = path.join(dir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, "a.ts"),
      "export function a() { return b(); }\nexport function b() { return 1; }\n",
    );

    const dbPath = path.join(dir, "chain.db");
    const handle = createServer({ dbPath, analyzeMaxFiles: 50 });
    shutdown = handle.shutdown;
    const client = await connectTestClient(handle.server);

    const session = await parseToolResult<{ session_id: string }>(
      await client.callTool({
        name: "create_session",
        arguments: { objective: "chain test", repo_path: dir },
      }),
    );

    await parseToolResult(
      await client.callTool({
        name: "analyze_repo",
        arguments: { session_id: session.session_id },
      }),
    );

    const impact = await parseToolResult<{ nodes: unknown[] }>(
      await client.callTool({
        name: "get_impact_map",
        arguments: {
          session_id: session.session_id,
          target: "src/a.ts::a",
          direction: "callees",
          depth: 2,
        },
      }),
    );
    expect(Array.isArray(impact.nodes)).toBe(true);

    const risks = await parseToolResult<{ items: unknown[] }>(
      await client.callTool({
        name: "get_top_risks",
        arguments: { session_id: session.session_id, limit: 5 },
      }),
    );
    expect(Array.isArray(risks.items)).toBe(true);

    await client.close();
  });
});
