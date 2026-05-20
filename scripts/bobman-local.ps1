# Run local bobman-mcp CLI with a Node binary that matches better-sqlite3 ABI.
# Usage: .\scripts\bobman-local.ps1 doctor
#        .\scripts\bobman-local.ps1 start

param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Command,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Rest
)

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Cli = Join-Path $RepoRoot "dist\cli\index.cjs"

$CursorNode = Join-Path $env:LOCALAPPDATA "Programs\cursor\resources\app\resources\helpers\node.exe"
$Node = if (Test-Path $CursorNode) { $CursorNode } else { "node" }

if (-not (Test-Path $Cli)) {
  Write-Error "Build first: cd $RepoRoot; npm run build"
  exit 1
}

& $Node $Cli $Command @Rest
