import fs from "node:fs";

export type McpHostId = "cursor" | "vscode" | "opencode" | "kiro" | "copilot-cli" | "all";

const BOBMAN_ARGS = ["-y", "bobman-mcp"] as const;
const BOBMAN_CMD = "npx";

export function cursorSnippet(): string {
  return JSON.stringify(
    {
      mcpServers: {
        bobman: {
          command: BOBMAN_CMD,
          args: [...BOBMAN_ARGS],
        },
      },
    },
    null,
    2,
  );
}

export function vscodeSnippet(): string {
  return JSON.stringify(
    {
      servers: {
        bobman: {
          type: "stdio",
          command: BOBMAN_CMD,
          args: [...BOBMAN_ARGS],
        },
      },
    },
    null,
    2,
  );
}

export function opencodeSnippet(): string {
  return JSON.stringify(
    {
      mcp: {
        bobman: {
          type: "local",
          command: [BOBMAN_CMD, ...BOBMAN_ARGS],
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
          command: BOBMAN_CMD,
          args: [...BOBMAN_ARGS],
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
        bobman: {
          command: BOBMAN_CMD,
          args: [...BOBMAN_ARGS],
        },
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
      return { vscode: vscodeSnippet() };
    case "opencode":
      return { opencode: opencodeSnippet() };
    case "kiro":
      return { kiro: kiroSnippet() };
    case "copilot-cli":
      return { "copilot-cli": copilotCliSnippet() };
    case "all":
      return {
        cursor: cursorSnippet(),
        vscode: vscodeSnippet(),
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
    cursor: "~/.cursor/mcp.json",
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
