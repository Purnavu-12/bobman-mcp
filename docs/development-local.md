# Local development (maintainers)

For contributors cloning [github.com/Purnavu-12/bobman-mcp](https://github.com/Purnavu-12/bobman-mcp). End users should use [production.md](production.md) (`npx bobman-mcp`).

## Build

```bash
git clone https://github.com/Purnavu-12/bobman-mcp.git
cd bobman-mcp
npm install
npm run build
npm test   # pretest runs ensure-built.cjs if dist/ is missing
```

## Run CLI from clone

```bash
node dist/cli/index.cjs init
node dist/cli/index.cjs doctor
node dist/cli/index.cjs start
```

Or `npm link` then `bobman-mcp doctor` from any repo (rebuild `better-sqlite3` after switching Node versions).

## Windows: Node ABI

If system `node` is **24** but dependencies were built for **22**, use one approach:

1. **Node 22 for BobMan** — `nvm-windows` / `fnm` / editor-bundled Node 22, then `npm rebuild better-sqlite3` in the clone.
2. **Scripts** (optional helpers, not shipped on npm):
   - `scripts/bobman-local.ps1` — picks Cursor’s Node 22 when present
   - `bobman.cmd` at repo root — same for cmd.exe

Do not document machine-specific paths in committed MCP configs. Use `npx bobman-mcp` in shared snippets; override locally only in untracked editor settings.

## MCP while developing

Point MCP at the built CLI (example — adjust clone path):

```json
{
  "mcpServers": {
    "bobman": {
      "command": "node",
      "args": ["/absolute/path/to/bobman-mcp/dist/cli/index.cjs", "start"]
    }
  }
}
```

## VS Code extension (F5)

```bash
cd extensions/vscode-bobman
npm install
npm run build
```

Open `extensions/vscode-bobman` in VS Code → **Run Extension**. For local CLI, set workspace `bobman.command` / `bobman.commandArgs` in **your** untracked `.vscode/settings.json`.

Package VSIX: `npm run package` (output gitignored).
