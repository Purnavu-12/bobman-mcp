# Contributing to BobMan MCP

**Repository:** [github.com/Purnavu-12/bobman-mcp](https://github.com/Purnavu-12/bobman-mcp)

## Development setup

See [docs/development-local.md](docs/development-local.md). Production install for users is [docs/production.md](docs/production.md) (`npx bobman-mcp` only — no committed machine paths).

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

## VS Code extension

The sidebar lives under `extensions/vscode-bobman/`. It is built in CI but not published to the Marketplace yet. See [docs/vscode-extension.md](docs/vscode-extension.md).
