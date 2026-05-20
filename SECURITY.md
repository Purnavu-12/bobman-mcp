# Security Policy

## Supported Versions

The latest published version of `bobman-mcp` on npm is the only supported version. Older versions do not receive security fixes; please upgrade.

| Version | Supported |
|---------|-----------|
| Latest published `0.x` | Yes |
| Older `0.x` | No — please upgrade |

## Reporting a Vulnerability

Please do **not** open public GitHub issues for security reports.

Instead, open a **private security advisory** on [github.com/Purnavu-12/bobman-mcp](https://github.com/Purnavu-12/bobman-mcp) under **Security → Advisories → Report a vulnerability**. Include:

1. A short description of the vulnerability
2. Reproduction steps (smallest possible reproduction is best)
3. Impact assessment (which capabilities or data are at risk)
4. Optional: proposed fix

## Response SLA

- **Acknowledgement**: within 3 business days
- **Triage decision**: within 7 business days
- **Patch availability**: target within 14 business days for confirmed High/Critical issues
- **Public disclosure**: coordinated with reporter, typically 30 days after patch release

## Scope

In scope:
- The `bobman-mcp` CLI and library code published to npm
- The OpenSpec change pipeline

Out of scope:
- Vulnerabilities in `better-sqlite3`, `pino`, or other upstream dependencies (please report to the upstream project)
- Local-only attacks that require write access to the user's repo directory
- Denial of service via deliberately malformed task graphs (the MCP is local; rate-limit at the host layer)

## Safe Harbor

Researchers acting in good faith and following this policy will not have legal action taken against them by the project maintainers.
