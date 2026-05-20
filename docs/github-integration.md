# GitHub integration

BobMan exposes two read-only MCP tools backed by `@octokit/rest`:

- `get_pr_context(session_id, owner, repo, pr_number)`
- `get_issue_context(session_id, owner, repo, issue_number)`

## Authentication

Set `GITHUB_TOKEN` in the BobMan server environment. A fine-grained PAT with `Contents: Read` and `Pull requests: Read` is sufficient for public + private repos. If the token is missing, the tools return `code = "GITHUB_TOKEN_MISSING"` rather than crashing.

## Rate limits

GitHub's API allows 5,000 authenticated requests per hour per token. On a 403 we surface `details.rate_limit_remaining` so the caller can back off.

## Response caps

- `files_changed`: up to 50 files per PR
- `checks`: up to 20 check runs
- `comments`: last 10, sorted newest-first

Larger PRs / issues should still work — the response is just truncated to fit BobMan's token budget.

## Security notes

- BobMan never writes to GitHub.
- The token is read once from the environment; do not put it in `bobman.config.json`.
