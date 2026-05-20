# BobMan MCP

[![npm version](https://img.shields.io/npm/v/bobman-mcp.svg)](https://www.npmjs.com/package/bobman-mcp)
[![CI](https://github.com/bobman-mcp/bobman-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/bobman-mcp/bobman-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "bobman": {
      "command": "npx",
      "args": ["-y", "bobman-mcp"]
    }
  }
}
```

Claude Code:

```bash
claude mcp add bobman npx -y bobman-mcp
```

---

BobMan is a closed-loop engineering orchestrator MCP. It gives Cursor and Claude Code a stateful task brain: you describe an objective, seed a task graph, and the agent loops through `get_next_task` → work → `report_complete` until the session reaches `COMPLETE` or `BLOCKED`. All state persists in local SQLite — zero external APIs, zero AI cost on the BobMan side.

## Quick start

```bash
npm install
npm run build
npx bobman-mcp init
```

Run the server (stdio, for MCP hosts):

```bash
npx bobman-mcp start
```

## Configuration

`bobman.config.json` (created by `init`):

| Field | Description |
|-------|-------------|
| `repoPath` | Repository root for analysis and DB keying |
| `transport` | `stdio` (foundation) |
| `dbPath` | Optional override for SQLite file path |
| `maxAttempts` | Default per-task retry cap (1–5) |
| `logLevel` | Pino level (`info`, `debug`, …) |

Database default: `~/.bobman/<repo-hash>.db` (override with `BOBMAN_HOME`).

## MCP tools

- **create_session** — Start a persisted engineering session with an objective.
- **seed_task_graph** — Insert a manual task DAG (tasks + dependency edges) while session is `INIT`.
- **get_next_task** — Receive the next bounded task (paths only, never inlined file contents; &lt;2,000 token budget).
- **report_complete** — Submit findings and test results; BobMan evaluates and advances or retries.
- **get_session_status** — Read-only progress, in-flight task, blockers, elapsed time.

## Troubleshooting

Run `npx bobman-mcp doctor` to print a PASS/FAIL diagnostic table covering Node version, `better-sqlite3` load, DB writability, and config presence.

**Windows / `better-sqlite3` ABI mismatch** — Cursor's bundled Node (ABI 127) and system Node 24 (ABI 137) require different prebuilt binaries. See [docs/install-windows.md](docs/install-windows.md) for the recommended fix per setup.

**SQLite locked** — Only one writer per DB file; use distinct sessions or wait for WAL busy timeout (5s).

**Agent does not call tools** — Tool descriptions are written as imperative "call when…" hints; remind the agent to use BobMan at session start.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Follow-up capabilities are tracked as separate OpenSpec changes (`add-treesitter-analyzer`, `add-task-decomposition`, …).

## License

MIT — see [LICENSE](LICENSE).
