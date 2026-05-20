# BobMan MCP

[![npm version](https://img.shields.io/npm/v/bobman-mcp.svg)](https://www.npmjs.com/package/bobman-mcp)
[![CI](https://github.com/Purnavu-12/bobman-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Purnavu-12/bobman-mcp/actions/workflows/ci.yml)
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

**Repository:** [github.com/Purnavu-12/bobman-mcp](https://github.com/Purnavu-12/bobman-mcp)

## Quick start (production)

```bash
npx bobman-mcp init --snippets all
npx bobman-mcp doctor
```

Use **Node 20 or 22 LTS** on Windows for the smoothest native module install. Full guide: [docs/production.md](docs/production.md).

## Quick start (developers)

Clone, build, and test: [docs/development-local.md](docs/development-local.md).

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

Core loop:

- **create_session** — Start a persisted engineering session with an objective.
- **decompose_objective** — Break a free-form objective into a draft task graph (numbered / bulleted / conjunction-split). Transitions session to `DECOMPOSING`.
- **seed_task_graph** — Insert a manual or decomposed task DAG (tasks + dependency edges).
- **get_next_task** — Receive the next bounded task (paths only, never inlined file contents; &lt;2,000 token budget).
- **report_complete** — Submit findings and test results; BobMan evaluates and advances or retries.
- **get_session_status** / **query_events** — Read-only progress, in-flight task, blockers, event tail.
- **validate_file_scope** — Resolve declared file paths against the session's repo(s).

Code & change intelligence:

- **analyze_repo** — Tree-sitter (web-tree-sitter + WASM grammars) parse of TypeScript / Python / Go / Java / Rust. Persists `file_index`, `symbols`, `call_graph`.
- **get_impact_map** — BFS over the call graph in `callers` / `callees` / `both` direction, with depth cap and token-budget collapse.
- **get_change_hotspots** — Frequently-changed files ranked by commits, churn, unique authors, and conflict count, backed by an incremental git indexer (`simple-git`).
- **get_risk_score** / **get_top_risks** — Composite risk score per file/symbol combining fan-in, churn, conflict, and coverage gap, with cache invalidation on `analyze_repo` and git re-index.

Knowledge & reflection:

- **add_knowledge** / **query_knowledge** — SQLite FTS5 knowledge base scoped per session (decisions, constraints, facts, warnings, todos).
- **summarize_session** / **run_sprint_reflection** — Deterministic retrospective with shipped-vs-planned (git commits/files, release tags) and bottleneck signals. Auto-emitted on `COMPLETE`.
- **list_sessions** — Read-only list of recent sessions (VS Code sidebar).
- **analyze_codebase** / **create_task_graph** — PRD aliases for `analyze_repo` and `decompose_objective` (+ `seed_task_graph` for the DAG).

## MCP hosts

BobMan works on any MCP stdio host. See [docs/mcp-hosts.md](docs/mcp-hosts.md) for Cursor, Claude Code, VS Code Copilot, OpenCode, Kiro, and more.

```bash
npx bobman-mcp init --snippets all
npx bobman-mcp init --snippets vscode --write
```

Agent workflow: [AGENTS.md](AGENTS.md).

## PRD v1.0 / v1.1

BobMan implements the PRD v1.0 and v1.1 feature set (F-01–F-11) except PRD v2.0 items (Slack, cloud dashboard, PR bot). See [docs/prd-traceability.md](docs/prd-traceability.md) for the full mapping and production acceptance column.

Highlights from the completion wave:

- Real **coverage.json / lcov** ingestion for risk (`coverage_gap`, `risk_score_0_100`, explanations).
- Configurable **test pass threshold** on `report_complete` (`testPassThreshold` in config).
- **VS Code extension** — read-only sidebar (optional, not on npm): [docs/vscode-extension.md](docs/vscode-extension.md).

## Documentation

| Doc | Topic |
|-----|--------|
| [docs/production.md](docs/production.md) | **npm / npx install (any machine)** |
| [docs/mcp-hosts.md](docs/mcp-hosts.md) | Cursor, Copilot, OpenCode, Kiro, … |
| [docs/development-local.md](docs/development-local.md) | Clone + local CLI (maintainers) |
| [docs/publishing.md](docs/publishing.md) | npm publish, Smithery, going live |
| [docs/vscode-extension.md](docs/vscode-extension.md) | Sidebar vs MCP, VSIX, Marketplace |
| [docs/install-windows.md](docs/install-windows.md) | Node ABI / `better-sqlite3` |
| [docs/http-transport.md](docs/http-transport.md) | Streamable HTTP + token |
| [docs/github-integration.md](docs/github-integration.md) | `GITHUB_TOKEN` for PR/issue tools |
| [docs/release-runbook.md](docs/release-runbook.md) | Tag → npm release |
| [docs/prd-traceability.md](docs/prd-traceability.md) | PRD F-01–F-11 mapping |
| [AGENTS.md](AGENTS.md) | Agent closed-loop contract |

## GitHub & multi-repo

- **get_pr_context** / **get_issue_context** — Read-only Octokit fetch of PR / issue title, body, labels, files, checks, last-10 comments. Requires `GITHUB_TOKEN`.
- **add_session_repo** — Attach additional repos to a session; path resolution learns the `label::path` syntax. The legacy `repo_path` stays as the primary (`position = 0`) repo for back-compat.

## Transports

Stdio (default, for Cursor / Claude Code MCP hosts):

```bash
npx bobman-mcp start
```

Streamable HTTP (for shared dev containers / VS Code Connect mode):

```bash
BOBMAN_TOKEN=$(openssl rand -hex 16) npx bobman-mcp start --http :7711
```

Bearer-token authentication is required; binds to `127.0.0.1` by default. See [docs/http-transport.md](docs/http-transport.md) for `curl` examples and security notes. GitHub integration is documented in [docs/github-integration.md](docs/github-integration.md).

## Troubleshooting

Run `npx bobman-mcp doctor` to print a PASS/FAIL diagnostic table covering Node version, `better-sqlite3` load, DB writability, and config presence.

**Windows / `better-sqlite3` ABI mismatch** — Cursor's bundled Node (ABI 127) and system Node 24 (ABI 137) require different prebuilt binaries. See [docs/install-windows.md](docs/install-windows.md) for the recommended fix per setup.

**SQLite locked** — Only one writer per DB file; use distinct sessions or wait for WAL busy timeout (5s).

**Agent does not call tools** — Tool descriptions are written as imperative "call when…" hints; remind the agent to use BobMan at session start.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Follow-up capabilities are tracked as separate OpenSpec changes (`add-treesitter-analyzer`, `add-task-decomposition`, …).

## License

MIT — see [LICENSE](LICENSE).
