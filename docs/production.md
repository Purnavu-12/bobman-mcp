# Production setup (npm)

Use this guide for **any machine** after `bobman-mcp` is published to npm. No local clone paths, no editor-specific Node binaries.

**Repository:** [github.com/Purnavu-12/bobman-mcp](https://github.com/Purnavu-12/bobman-mcp)

## Requirements

| Requirement | Detail |
|-------------|--------|
| Node.js | **20.x or 22.x LTS** recommended (`engines`: `>=20.10 <25`) |
| Windows native module | `better-sqlite3` prebuilds ship for Node 20/22. Node 24 on Windows may need [VS C++ build tools](install-windows.md). |
| Git | On `PATH` (hotspots, reflection) |
| npm | For `npx` |

## 1. Install in your project

```bash
cd /path/to/your/repo
npx bobman-mcp init --snippets all
npx bobman-mcp doctor
```

`init` writes `bobman.config.json` and prints MCP snippets. To merge VS Code config into the repo:

```bash
npx bobman-mcp init --snippets vscode --write
```

## 2. MCP host config (production)

All hosts use the same command — **no absolute paths**:

```json
{
  "command": "npx",
  "args": ["-y", "bobman-mcp"]
}
```

| Host | File | Format |
|------|------|--------|
| Cursor | `~/.cursor/mcp.json` | `mcpServers.bobman` |
| VS Code + Copilot | `.vscode/mcp.json` | `servers.bobman` (`type: "stdio"`) |
| Claude Code | CLI | `claude mcp add bobman npx -y bobman-mcp` |
| OpenCode | `opencode.json` | `mcp.bobman` (`type: "local"`) |
| Kiro | `.kiro/settings/mcp.json` | `mcpServers.bobman` |

Open the **project root** that contains `bobman.config.json` in your editor. MCP hosts start the server with that folder as the working directory so SQLite uses `~/.bobman/<repo-hash>.db`.

Details: [mcp-hosts.md](mcp-hosts.md).

## 3. VS Code extension (optional sidebar)

The extension is **not** on npm. Install from [GitHub Releases](https://github.com/Purnavu-12/bobman-mcp/releases) (`vscode-bobman-*.vsix`) or build from source.

**Production defaults** (no workspace overrides needed):

| Setting | Default |
|---------|---------|
| `bobman.command` | `npx` |
| `bobman.commandArgs` | `["-y", "bobman-mcp", "start"]` |
| `bobman.repoPath` | *(empty)* → first workspace folder with `bobman.config.json` |

The extension appends `--repo-path` automatically so it opens the **same database** as Copilot MCP.

After the agent runs `create_session`:

1. Reload VS Code if you changed MCP settings.
2. Open **BobMan → Sessions** (should list sessions).
3. Click a session or run **BobMan: Set Active Session** for Tasks/Events.

Sidebar guide: [vscode-extension.md](vscode-extension.md).

## 4. Agent workflow

Add [AGENTS.md](../AGENTS.md) to your repo (or point agents at it). Closed loop:

`create_session` → `decompose_objective` → `seed_task_graph` → (`analyze_repo`) → `get_next_task` / `report_complete` until `COMPLETE`.

## 5. Verify production install

```bash
npx bobman-mcp doctor
```

Every row **PASS**. Then in your MCP host, allow `create_session` once and confirm `list_sessions` shows the row (extension **Sessions** view or a second terminal is not required).

## 6. Publishing BobMan itself

Maintainers: [release-runbook.md](release-runbook.md), [publishing.md](publishing.md).

## Local development (not production)

Cloning this repo and running `node dist/cli/index.cjs` is **development only**. See [development-local.md](development-local.md).
