# BobMan VS Code extension

**Repository:** [Purnavu-12/bobman-mcp](https://github.com/Purnavu-12/bobman-mcp) · `extensions/vscode-bobman`

Read-only sidebar for BobMan MCP. Agents still use **MCP** (`create_session`, `get_next_task`, …); the extension only displays SQLite state.

## Production install

1. Publish/consume **`bobman-mcp` via npm** in the project ([production.md](production.md)).
2. Install the extension from **[GitHub Releases](https://github.com/Purnavu-12/bobman-mcp/releases)** (`vscode-bobman-0.1.0.vsix` or newer).
3. Open the **workspace root** that contains `bobman.config.json`.
4. **Defaults work** — no settings required:

| Setting | Production default |
|---------|-------------------|
| `bobman.command` | `npx` |
| `bobman.commandArgs` | `["-y", "bobman-mcp", "start"]` |
| `bobman.repoPath` | *(empty)* — auto-detect folder with `bobman.config.json` |

The extension adds `--repo-path` so it uses the **same** `~/.bobman/<hash>.db` as Copilot MCP.

### Copilot MCP (same project)

`.vscode/mcp.json` from `npx bobman-mcp init --snippets vscode --write`:

```json
{
  "servers": {
    "bobman": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "bobman-mcp"]
    }
  }
}
```

Reload VS Code after MCP changes.

## MCP vs extension

| Need | Use |
|------|-----|
| Agent tools | **MCP** (stdio via `npx`) |
| Human visibility (trees) | **Extension** (optional) |

## Views (read-only)

| View | MCP tool |
|------|----------|
| Sessions | `list_sessions` |
| Tasks | `get_session_status` |
| Events | `query_events` |
| Hotspots | `get_change_hotspots` |
| Risks | `get_top_risks` |
| Knowledge | `query_knowledge` |

Click a **Sessions** row to set the active session. Newest session is auto-selected when none is set.

## HTTP mode (optional)

Run `BOBMAN_TOKEN=… npx bobman-mcp start --http :7711`, set `bobman.transport` to `http`, **BobMan: Set HTTP Token**. See [http-transport.md](http-transport.md).

## Troubleshooting

### Sessions empty after Copilot `create_session`

1. Workspace folder = project with `bobman.config.json`.
2. Copilot MCP uses `npx` / `bobman-mcp` (not a dev-only local `node` path unless you intend that).
3. Extension **defaults** still `npx` — remove old overrides that point at a maintainer’s clone.
4. **Developer: Reload Window** → **BobMan: Refresh**.
5. Status bar tooltip shows `repo:` — must match your project path.

### Errors in Sessions tree

Run `npx bobman-mcp doctor` in the project terminal (all **PASS**). On Windows Node 24 ABI issues, see [install-windows.md](install-windows.md).

## Local development only

Override settings in **untracked** `.vscode/settings.json` to point at `node …/dist/cli/index.cjs start`. See [development-local.md](development-local.md). Do not commit machine-specific paths.

## Marketplace

VSIX on GitHub Releases today; Marketplace publish is optional ([publishing.md](publishing.md)).
