# Release Runbook

**Repository:** [github.com/Purnavu-12/bobman-mcp](https://github.com/Purnavu-12/bobman-mcp)

Step-by-step procedure for cutting a new `bobman-mcp` release.

## Pre-flight (10 minutes)

1. Make sure `main` is green: `gh run list --branch main --limit 1` (or check the Actions tab)
2. Review what's shipped since the last tag:
   ```bash
   git fetch --tags
   git log $(git describe --tags --abbrev=0)..main --oneline
   ```
3. Decide the next semver number:
   - Patch (`0.1.0 → 0.1.1`): bug fixes, doc-only, internal refactors
   - Minor (`0.1.0 → 0.2.0`): new MCP tools, additive schema fields, new OpenSpec changes implemented
   - Major (`0.x.y → 1.0.0`): breaking tool input/output changes, schema migrations that drop columns

## Cut the release (5 minutes)

1. Bump the version:
   ```bash
   npm version <patch|minor|major> --no-git-tag-version
   ```
2. Run the local verification gauntlet:
   ```bash
   npm run lint
   npm run build
   npm test
   node scripts/check-pack.cjs
   ```
3. Commit and push:
   ```bash
   git add package.json package-lock.json
   git commit -m "chore(release): vX.Y.Z"
   git push origin main
   ```
4. Tag and push:
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

## Watch CI (10–20 minutes)

1. Open https://github.com/Purnavu-12/bobman-mcp/actions and confirm the `Release` workflow appears
2. Verify all `verify` matrix legs pass (Linux + Windows + macOS × Node 20 + 22 + 24 = 9 jobs)
3. Verify the `publish` job runs and reports `npm notice` followed by a successful `publish`

## Verify on npm (2 minutes)

```bash
npm view bobman-mcp@X.Y.Z version
npm view bobman-mcp@X.Y.Z dist.tarball
npm view bobman-mcp@X.Y.Z dist.shasum
```

Provenance check:

```bash
npm view bobman-mcp@X.Y.Z --json | jq '.dist.attestations'
```

The `attestations` block should be non-null for a provenance-signed publish.

Smoke test in a clean dir:

```bash
mkdir /tmp/bobman-smoke && cd /tmp/bobman-smoke
npx -y bobman-mcp@X.Y.Z doctor
```

Every row should read `PASS`. `bobman-mcp doctor` is part of the published artifact and is the fastest way to confirm the install path works end-to-end.

## Announce

Update CHANGELOG (if maintained) and post to relevant channels.

## Rollback procedure

If a release ships a regression:

1. Deprecate the bad version (does **not** remove it; consumers see a warning):
   ```bash
   npm deprecate bobman-mcp@X.Y.Z "Regression: <link to issue>. Use X.Y.W."
   ```
2. Cut a patch release with the fix following this same runbook
3. Do **not** unpublish unless within the 72-hour window and the version is clearly broken on install — unpublishing breaks downstream `package-lock.json` files

## Post-mortem template (use when something goes wrong)

```
## Incident summary

- Date / time:
- Released version:
- Symptoms:
- Detected via:
- Time to detection:
- Time to mitigation:

## Root cause

## What went well

## What didn't

## Action items

- [ ] (owner) ...
```
