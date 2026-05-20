import { describe, expect, it } from "vitest";
import {
  cursorSnippet,
  kiroSnippet,
  opencodeSnippet,
  snippetForHost,
  vscodeSnippet,
} from "../../src/lib/mcp-snippets.js";

describe("mcp snippets", () => {
  it("cursor snippet includes bobman-mcp", () => {
    const parsed = JSON.parse(cursorSnippet()) as { mcpServers: { bobman: { args: string[] } } };
    expect(parsed.mcpServers.bobman.args).toContain("bobman-mcp");
  });

  it("vscode snippet uses stdio type", () => {
    const parsed = JSON.parse(vscodeSnippet()) as {
      servers: { bobman: { type: string; command: string } };
    };
    expect(parsed.servers.bobman.type).toBe("stdio");
    expect(parsed.servers.bobman.command).toBe("npx");
  });

  it("opencode snippet uses local type", () => {
    const parsed = JSON.parse(opencodeSnippet()) as {
      mcp: { bobman: { type: string; command: string[] } };
    };
    expect(parsed.mcp.bobman.type).toBe("local");
    expect(parsed.mcp.bobman.command.join(" ")).toContain("bobman-mcp");
  });

  it("all host snippets parse", () => {
    const all = snippetForHost("all");
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(4);
    for (const json of Object.values(all)) {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      expect(parsed).toBeTruthy();
    }
  });

  it("kiro matches cursor-style mcpServers", () => {
    const parsed = JSON.parse(kiroSnippet()) as { mcpServers: Record<string, unknown> };
    expect(parsed.mcpServers.bobman).toBeTruthy();
  });
});
