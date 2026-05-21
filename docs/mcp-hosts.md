# BobMan MCP host compatibility

**Repository:** [github.com/Purnavu-12/bobman-mcp](https://github.com/Purnavu-12/bobman-mcp)

BobMan speaks standard MCP over **stdio** (`npx -y bobman-mcp@0.1.1`) or **Streamable HTTP** (see [http-transport.md](http-transport.md)). Hosts differ only in config file location and JSON shape.

**Always pin the version** in MCP config (`bobman-mcp@X.Y.Z`) so `npx` does not pick up a `npm link`’d git clone. On Windows, the published npm bin prefers **Cursor’s bundled Node 22** when installed, which avoids `better-sqlite3` ABI mismatches when Cursor MCP uses Node 24.

For the optional read-only VS Code sidebar (not required for MCP), see [vscode-extension.md](vscode-extension.md).

## Quick setup

```bash
npx bobman-mcp init --snippets all
npx bobman-mcp init --snippets vscode --write   # writes .vscode/mcp.json in cwd
npx bobman-mcp doctor
```

## Host matrix

| Host | Config file | Transport |
|------|-------------|-----------|
| Cursor | `~/.cursor/mcp.json` | stdio |
| Claude Code | CLI | `claude mcp add bobman npx -y bobman-mcp` |
| VS Code + Copilot | `.vscode/mcp.json` | stdio (`type: "stdio"`) |
| GitHub Copilot CLI | `~/.copilot/mcp-config.json` | stdio |
| OpenCode | `opencode.json` → `mcp` | `type: "local"` |
| Kiro | `.kiro/settings/mcp.json` | stdio |
| Windsurf / Cline / Zed | Often Cursor-compatible | Copy Cursor `mcpServers` block |

## Smoke test (any host)

After the host loads BobMan tools:

1. Call `list_sessions` or `create_session` with a short objective.
2. Call `get_session_status` for the returned `session_id`.
3. Confirm no JSON errors and tools appear in the host’s MCP panel.

## HTTP / remote

For shared containers or the VS Code extension Connect mode:

```bash
BOBMAN_TOKEN=$(openssl rand -hex 16) npx bobman-mcp start --http :7711
```

Point remote clients at `http://127.0.0.1:7711/mcp` with `Authorization: Bearer <token>`.

## VS Code extension vs Copilot MCP

- **Copilot MCP** — agent invokes BobMan tools inside chat.
- **vscode-bobman extension** — read-only sidebar (sessions, tasks, events). See [vscode-extension.md](vscode-extension.md).

Use both together or either alone.
