# BobMan agent contract

BobMan is a **closed-loop engineering orchestrator**. You drive work through MCP tools; BobMan persists session state, task graphs, and evaluation in local SQLite. Do not bypass the loop for multi-step engineering work.

## When to use BobMan

- Multi-step refactors, features, or fixes that need a task graph and progress tracking
- Work where you must prove tests passed before advancing (`report_complete`)
- Sessions where you need impact maps, hotspots, risk scores, or knowledge capture

For one-off questions or single-file edits, BobMan is optional.

## Closed loop (required sequence)

```
create_session
    → decompose_objective (optional) → seed_task_graph
    → analyze_repo (optional, before risky edits)
    → get_next_task → [implement] → report_complete
    → repeat until COMPLETE or BLOCKED
```

1. **create_session** — Set a clear `objective`. Note `session_id`.
2. **decompose_objective** / **seed_task_graph** — Define tasks and dependency edges. Use **validate_file_scope** if paths are declared.
3. **get_next_task** — Work only on the returned task. Respect file path hints; do not expect inlined file contents.
4. **report_complete** — Submit honest `test_results` (`total`, `passed`, `failed`, `skipped`). BobMan gates advancement on `testPassThreshold` (default 100% pass rate).
5. **get_session_status** / **query_events** — Check progress when blocked or between tasks.

On **COMPLETE**, BobMan may auto-run sprint reflection. Use **add_knowledge** / **query_knowledge** for decisions and constraints.

## Tool aliases (PRD)

| Alias | BobMan tool |
|-------|-------------|
| `analyze_codebase` | `analyze_repo` |
| `create_task_graph` | `decompose_objective` (+ `seed_task_graph` for the DAG) |

## Rules

- **Honest tests** — Never inflate `passed`; failed tests can retry up to `maxAttempts` then block the session.
- **One writer** — One MCP server process per repo DB; avoid parallel writers to the same `~/.bobman/<hash>.db`.
- **Same repo root** — VS Code Copilot MCP and the BobMan extension must use the workspace folder that contains `bobman.config.json` (extension adds `--repo-path` automatically).
- **Read-only sidebar** — The VS Code extension displays state; agents still call MCP tools for mutations.

## VS Code extension (human visibility)

Install `vscode-bobman` from [GitHub Releases](https://github.com/Purnavu-12/bobman-mcp/releases). Defaults: `npx -y bobman-mcp start` with `--repo-path` aligned to Copilot MCP. See [docs/vscode-extension.md](docs/vscode-extension.md).

## Host setup

```bash
npx bobman-mcp init --snippets all
npx bobman-mcp doctor
```

See [docs/mcp-hosts.md](docs/mcp-hosts.md) for Cursor, Claude Code, VS Code Copilot, OpenCode, and Kiro.

## HTTP mode (optional)

```bash
BOBMAN_TOKEN=$(openssl rand -hex 16) npx bobman-mcp start --http :7711
```

Set `bobman.transport` to `http` in the extension and store the token via **BobMan: Set HTTP Token**. See [docs/http-transport.md](docs/http-transport.md).
