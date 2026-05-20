# Installing bobman-mcp on Windows

BobMan uses `better-sqlite3`, a native module compiled per Node.js ABI. The most common Windows install failure is an ABI mismatch between the Node that ran `npm install` and the Node that Cursor (or another MCP host) uses to start the server.

## Quick diagnosis

```powershell
npx bobman-mcp doctor
```

The output is a PASS/FAIL table. If the `better-sqlite3 load` row reads `FAIL` you have an ABI mismatch.

## ABI table

| Node version | NODE_MODULE_VERSION (ABI) | Notes |
|---|---|---|
| Node 20.x | 115 | LTS, prebuild available |
| Node 22.x | 127 | Bundled inside Cursor (`...cursor/resources/app/resources/helpers/node.exe`) |
| Node 24.x | 137 | Current `nodejs.org` stable; requires VS C++ build tools to compile native modules |

`bobman-mcp doctor` prints the active Node version and ABI on its first line.

## Fix 1 — Use Cursor's bundled Node (no build tools required)

If your goal is "run BobMan inside Cursor", point Cursor's MCP config at its own Node binary so the prebuilt `better-sqlite3` for ABI 127 is loaded:

```json
{
  "mcpServers": {
    "bobman": {
      "command": "C:\\Users\\<YOU>\\AppData\\Local\\Programs\\cursor\\resources\\app\\resources\\helpers\\node.exe",
      "args": ["D:/path/to/bobman-mcp/dist/cli/index.cjs", "start"],
      "cwd": "D:/your/project"
    }
  }
}
```

Then rebuild `better-sqlite3` once against that same Node:

```powershell
$cursor = "$env:LOCALAPPDATA\Programs\cursor\resources\app\resources\helpers\node.exe"
$env:Path = "$([System.IO.Path]::GetDirectoryName($cursor));" + $env:Path
npm rebuild better-sqlite3
```

## Fix 2 — Use system Node 24 (requires build tools)

If you want to use system Node 24, you need the Visual Studio "Desktop development with C++" workload installed:

1. Install **Visual Studio Build Tools 2022** (or VS 2022 Community) with the "Desktop development with C++" workload checked.
2. Install Python 3.11+ and expose it as `PYTHON` env var or via `npm config set python <path>`.
3. Run:
   ```powershell
   npm rebuild better-sqlite3
   ```

This compiles a Node 24 (ABI 137) binary from source.

## Fix 3 — Use a node version manager

`fnm` or `nvm-windows` lets you keep multiple Node versions side by side. After switching versions, always run `npm rebuild better-sqlite3` so the binary matches the active ABI.

## After the rebuild

```powershell
npx bobman-mcp doctor
```

Every row should read `PASS`. If `better-sqlite3 load` still fails, capture the doctor output and open an issue.
