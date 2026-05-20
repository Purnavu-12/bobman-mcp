import fs from "node:fs";
import path from "node:path";

export function runInit(cwd = process.cwd()): void {
  const configPath = path.join(cwd, "bobman.config.json");
  const config = {
    repoPath: cwd.replace(/\\/g, "/"),
    transport: "stdio",
    dbPath: null as string | null,
    maxAttempts: 3,
    logLevel: "info",
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");

  const cursorSnippet = `{
  "mcpServers": {
    "bobman": {
      "command": "npx",
      "args": ["-y", "bobman-mcp"]
    }
  }
}`;

  console.log("Add to ~/.cursor/mcp.json:\n");
  console.log(cursorSnippet);
  console.log("\nClaude Code:\n");
  console.log("claude mcp add bobman npx -y bobman-mcp");
  console.log(`\nWrote ${configPath}`);
}
