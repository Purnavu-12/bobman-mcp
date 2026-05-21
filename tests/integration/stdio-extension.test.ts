import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { writeDefaultConfig } from "../../src/lib/config.js";
import { parseToolResult } from "./_client.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_ENTRY = path.join(REPO_ROOT, "dist/cli/index.cjs");
const CLI_BUILT = fs.existsSync(CLI_ENTRY);

function buildExtensionStyleArgs(repoPath: string): string[] {
  const baseArgs = ["start"];
  const args = [...baseArgs];
  if (!args.includes("--repo-path")) {
    args.push("--repo-path", repoPath);
  }
  return args;
}

describe.skipIf(!CLI_BUILT)(
  "stdio transport (VS Code extension parity)",
  () => {
    let client: Client | undefined;
    let prevBobmanHome: string | undefined;

    afterEach(async () => {
      if (prevBobmanHome === undefined) delete process.env.BOBMAN_HOME;
      else process.env.BOBMAN_HOME = prevBobmanHome;
      prevBobmanHome = undefined;

      if (client) {
        try {
          await client.close();
        } catch {
          // ignore
        }
        client = undefined;
      }
    });

    it("spawns CLI with --repo-path and round-trips list_sessions / create_session", async () => {
      const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-ext-stdio-"));
      writeDefaultConfig(repoDir);
      const bobmanHome = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-home-"));
      prevBobmanHome = process.env.BOBMAN_HOME;
      process.env.BOBMAN_HOME = bobmanHome;

      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [CLI_ENTRY, ...buildExtensionStyleArgs(repoDir)],
        cwd: repoDir,
        env: { ...getDefaultEnvironment(), BOBMAN_HOME: bobmanHome },
      });

      client = new Client({ name: "bobman-stdio-extension-test", version: "0.0.0" });
      await client.connect(transport);

      const empty = await parseToolResult<{ sessions: Array<{ session_id: string }> }>(
        await client.callTool({ name: "list_sessions", arguments: { limit: 10 } }),
      );
      expect(empty.sessions).toEqual([]);

      const created = await parseToolResult<{ session_id: string; state: string }>(
        await client.callTool({
          name: "create_session",
          arguments: { objective: "Extension stdio smoke test" },
        }),
      );
      expect(created.state).toBe("INIT");
      expect(created.session_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      const listed = await parseToolResult<{ sessions: Array<{ session_id: string; objective: string }> }>(
        await client.callTool({ name: "list_sessions", arguments: { limit: 10 } }),
      );
      expect(listed.sessions.some((s) => s.session_id === created.session_id)).toBe(true);
      expect(listed.sessions[0]?.objective).toContain("Extension stdio");

      const status = await parseToolResult<{ state: string }>(
        await client.callTool({
          name: "get_session_status",
          arguments: { session_id: created.session_id },
        }),
      );
      expect(status.state).toBe("INIT");
    }, 30_000);
  },
);
