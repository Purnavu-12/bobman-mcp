import { writeDefaultConfig } from "../src/lib/config.js";

export function runInit(cwd = process.cwd()): void {
  const configPath = writeDefaultConfig(cwd);

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
