# Installing bobman-mcp on Windows

## Production (npm)

Same as every platform — no custom paths:

```powershell
cd C:\path\to\your\repo
npx bobman-mcp init --snippets vscode --write
npx bobman-mcp doctor
```

MCP config (`.vscode/mcp.json`):

```json
{
  "servers": {
    "bobman": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "bobman-mcp"]
    }
  }
}
```

Open your **project folder** in VS Code. Copilot and the optional BobMan extension both use `npx` and the same `bobman.config.json`.

Full guide: [production.md](production.md).

## Node version on Windows

| Node | ABI | `better-sqlite3` on Windows |
|------|-----|-----------------------------|
| 20.x LTS | 115 | Prebuild (recommended) |
| 22.x LTS | 127 | Prebuild (recommended) |
| 24.x | 137 | Often needs compile from source |

`bobman-mcp doctor` prints your Node version on line 1. If `better-sqlite3 load` is **FAIL** with `NODE_MODULE_VERSION`, use Node 20/22 or rebuild:

```powershell
npm rebuild better-sqlite3
```

(From a global install: `cd` to the package directory, or reinstall with the Node version you will use for `npx`.)

### Node 24 + compile from source

1. Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with **Desktop development with C++**.
2. Python 3.11+ on PATH.
3. `npm rebuild better-sqlite3`

## VS Code extension (optional)

Install `vscode-bobman-*.vsix` from [GitHub Releases](https://github.com/Purnavu-12/bobman-mcp/releases). **Do not** override `bobman.command` unless you are developing BobMan locally — defaults are `npx` + `bobman-mcp`.

See [vscode-extension.md](vscode-extension.md).

## Editor bundled Node (advanced)

Some editors ship their own Node (e.g. ABI 127). Only if `npx` uses a different Node than your editor’s MCP runtime, point MCP at that editor’s `node.exe` **locally** in untracked settings — not in the published repo template. Prefer **Node 22 LTS** system-wide instead.

## Local clone development

See [development-local.md](development-local.md) — not for production users.
