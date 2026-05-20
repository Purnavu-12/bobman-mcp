# Publishing and distribution

**Repository:** [github.com/Purnavu-12/bobman-mcp](https://github.com/Purnavu-12/bobman-mcp)

BobMan ships as two products:

| Product | How users get it | Status |
|---------|------------------|--------|
| **bobman-mcp** (npm) | `npx -y bobman-mcp` | Publish with git tag → [release-runbook.md](release-runbook.md) |
| **vscode-bobman** (extension) | VSIX from Releases or Marketplace | Code complete; Marketplace optional |

## npm (primary — MCP for everyone)

1. Add GitHub secret `NPM_TOKEN` on [Purnavu-12/bobman-mcp](https://github.com/Purnavu-12/bobman-mcp).
2. Tag `vX.Y.Z` matching `package.json` version.
3. Release workflow publishes to npm with provenance.
4. Smoke test: `npx -y bobman-mcp@X.Y.Z doctor` (all PASS).

User install (after publish): [production.md](production.md).

```bash
npx bobman-mcp init --snippets all
npx bobman-mcp doctor
```

Point them to [mcp-hosts.md](mcp-hosts.md) and [AGENTS.md](../AGENTS.md). No machine-specific paths in committed configs.

## MCP directories (discovery)

- Submit [smithery.yaml](../smithery.yaml) + repo to [Smithery](https://smithery.ai)
- List on [MCP.so](https://mcp.so) and [PulseMCP](https://www.pulsemcp.com)
- Registry metadata: [server.json](../server.json)

## VS Code extension (optional sidebar)

The extension is **not** included in the npm package. See [vscode-extension.md](vscode-extension.md).

- **Today:** build VSIX, attach to GitHub Release, document install steps.
- **Later:** `vsce publish` after creating a Marketplace publisher.

Most users only need **Copilot/Cursor MCP** (stdio), not the sidebar extension.

## What is not in v1

- Hosted BobMan Cloud
- Slack / web dashboard / PR comment bot (PRD v2)
