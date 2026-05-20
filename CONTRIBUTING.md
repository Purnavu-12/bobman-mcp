# Contributing to BobMan MCP

## Development setup

```bash
npm install
npm run build
npm test
npm run lint
```

## OpenSpec workflow

This project uses [OpenSpec](https://github.com/Fission-AI/OpenSpec) for spec-driven changes.

- Active change: `openspec/changes/add-bobman-mcp-foundation/`
- Propose: `/opsx:propose <description>`
- Apply: `/opsx:apply <change-name>`
- Archive when done: `/opsx:archive`

Follow-up capabilities (Tree-sitter analyzer, task decomposition, risk scoring, etc.) should each get their own focused change.

## Pull requests

1. Run `npm test` and `npm run lint` on Windows, macOS, or Linux.
2. Keep MCP stdout clean — logs go to stderr only.
3. Add or update tests for behavior changes in `src/state/**` and `src/tools/**`.
