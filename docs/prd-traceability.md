# PRD v1.0 / v1.1 traceability

**Repository:** [github.com/Purnavu-12/bobman-mcp](https://github.com/Purnavu-12/bobman-mcp)

Maps [BobMan_PRD_v1.0.md](../BobMan_PRD_v1.0.md) features to implementation, tests, and production acceptance.

| PRD ID | Feature | Tools / files | Tests | Status | Production acceptance |
|--------|---------|---------------|-------|--------|------------------------|
| F-01 | Core MCP + stdio + SQLite | `src/server.ts`, 23 tools | `tests/integration/boot.test.ts` | Done | Boot lists all tools; [mcp-hosts.md](mcp-hosts.md) smoke |
| F-02 | Analyzer + impact | `src/analyzer/`, `analyze_repo` | `analyzer*.test.ts`, `analyze-max-files.test.ts` | Done | `analyzeMaxFiles` cap optional |
| F-03 | Task DAG | `decompose_objective`, `seed_task_graph` | `decompose*.test.ts`, `closed-loop.test.ts` | Done | `next_tool: seed_task_graph` |
| F-04 | Closed loop + eval gate | `report_complete`, `testPassThreshold` | `report-complete*.test.ts` | Done | [AGENTS.md](../AGENTS.md) honest test_results |
| F-05 | Risk + coverage | `src/lib/coverage.ts`, risk tools | `coverage.test.ts`, `risk.test.ts` | Done | Default `coveragePaths` in init |
| F-06 | CLI | `cli/` | `cli.test.ts`, `doctor.test.ts` | Done | `init --snippets`, doctor CLI check |
| F-07 | HTTP | `src/transport/http.ts` | `http-transport.test.ts` (401) | Done | Token required off loopback |
| F-08 | Go/Java/Rust | `src/analyzer/languages/` | `analyzer-languages.test.ts` | Done | WASM tree-sitter path |
| F-09 | impact + risk | impact/risk tools | `tool-chain.test.ts` | Done | analyze → impact → top_risks |
| F-10 | Reflection | `src/lib/reflection.ts` | `reflection.test.ts` | Done | `ensureSessionSummary` no race |
| F-11 | VS Code sidebar | `extensions/vscode-bobman/` | `mappers.test.ts` | Done | VSIX build; Marketplace deferred |

## Host compatibility

See [mcp-hosts.md](mcp-hosts.md) for Cursor, Claude Code, VS Code Copilot, OpenCode, Kiro, Copilot CLI.

## PRD tool aliases

| PRD name | BobMan tool | Notes |
|----------|-------------|-------|
| `analyze_codebase` | `analyze_repo` | Same handler |
| `create_task_graph` | `decompose_objective` | Then `seed_task_graph` |
| Sprint reflection | `run_sprint_reflection` | Alias of `summarize_session` |

## OpenSpec changes

- `add-mcp-host-compatibility`
- `add-prd-production-readiness`
- Prior: `add-prd-coverage-risk`, `add-prd-eval-gate`, `add-sprint-shipped-planned`, `add-vscode-sidebar`
