# Changelog

## 0.1.0 — 2026-05-20

Initial closed-loop foundation:

- stdio MCP server (`bobman-mcp`) for Cursor and Claude Code
- SQLite persistence with WAL and schema v1 migrations
- Session state machine and task graph DAG
- Tools: `create_session`, `seed_task_graph`, `get_next_task`, `report_complete`, `get_session_status`
- CLI: `npx bobman-mcp init` and `npx bobman-mcp start`
- Secret sanitization on persisted findings
- Token budget enforcement on `get_next_task` responses
