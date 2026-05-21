import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type McpHostId = "cursor" | "vscode" | "opencode" | "kiro" | "copilot-cli" | "all";

const BOBMAN_CMD = "npx";

/** Pin the published package version so npx does not pick up a linked git clone. */
export function publishedNpxArgs(version = readPackageVersion()): string[] {
  return ["-y", `bobman-mcp@${version}`];
}

function readPackageVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(here, "..", "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

function bobmanNpxEntry() {
  return {
    command: BOBMAN_CMD,
    args: publishedNpxArgs(),
  };
}

export function cursorSnippet(): string {
  return JSON.stringify(
    {
      mcpServers: {
        bobman: bobmanNpxEntry(),
      },
    },
    null,
    2,
  );
}

/** VS Code Copilot MCP shape (`servers`). */
export function vscodeSnippet(): string {
  return JSON.stringify(
    {
      servers: {
        bobman: {
          type: "stdio",
          ...bobmanNpxEntry(),
        },
      },
    },
    null,
    2,
  );
}

/** Cursor + Copilot in one workspace file (no schema conflict in either editor). */
export function vscodeWorkspaceSnippet(): string {
  return JSON.stringify(
    {
      mcpServers: {
        bobman: bobmanNpxEntry(),
      },
      servers: {
        bobman: {
          type: "stdio",
          ...bobmanNpxEntry(),
        },
      },
    },
    null,
    2,
  );
}

export function opencodeSnippet(): string {
  const args = publishedNpxArgs();
  return JSON.stringify(
    {
      mcp: {
        bobman: {
          type: "local",
          command: [BOBMAN_CMD, ...args],
          enabled: true,
        },
      },
    },
    null,
    2,
  );
}

export function kiroSnippet(): string {
  return JSON.stringify(
    {
      mcpServers: {
        bobman: {
          ...bobmanNpxEntry(),
          disabled: false,
        },
      },
    },
    null,
    2,
  );
}

export function copilotCliSnippet(): string {
  return JSON.stringify(
    {
      mcpServers: {
        bobman: bobmanNpxEntry(),
      },
    },
    null,
    2,
  );
}

export function snippetForHost(host: McpHostId): Record<string, string> {
  switch (host) {
    case "cursor":
      return { cursor: cursorSnippet() };
    case "vscode":
      return { vscode: vscodeWorkspaceSnippet() };
    case "opencode":
      return { opencode: opencodeSnippet() };
    case "kiro":
      return { kiro: kiroSnippet() };
    case "copilot-cli":
      return { "copilot-cli": copilotCliSnippet() };
    case "all":
      return {
        cursor: cursorSnippet(),
        vscode: vscodeWorkspaceSnippet(),
        opencode: opencodeSnippet(),
        kiro: kiroSnippet(),
        "copilot-cli": copilotCliSnippet(),
      };
    default:
      return { cursor: cursorSnippet() };
  }
}

export function hostConfigPaths(): Record<string, string> {
  return {
    cursor: ".cursor/mcp.json (project) or ~/.cursor/mcp.json",
    vscode: ".vscode/mcp.json",
    opencode: "opencode.json",
    kiro: ".kiro/settings/mcp.json",
    "copilot-cli": "~/.copilot/mcp-config.json",
  };
}

export function mergeJsonFile(existingPath: string, fragment: Record<string, unknown>): string {
  let base: Record<string, unknown> = {};
  try {
    if (fs.existsSync(existingPath)) {
      base = JSON.parse(fs.readFileSync(existingPath, "utf8")) as Record<string, unknown>;
    }
  } catch {
    base = {};
  }
  const merged = deepMerge(base, fragment);
  return JSON.stringify(merged, null, 2);
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...target };
  for (const [key, val] of Object.entries(source)) {
    if (
      val &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      typeof out[key] === "object" &&
      out[key] &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(
        out[key] as Record<string, unknown>,
        val as Record<string, unknown>,
      );
    } else {
      out[key] = val;
    }
  }
  return out;
}
