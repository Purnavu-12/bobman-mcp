@echo off
REM Development-only helper (repo clone). Production users: npx bobman-mcp
set "NODE22=%LOCALAPPDATA%\Programs\cursor\resources\app\resources\helpers\node.exe"
if not exist "%NODE22%" (
  echo bobman.cmd: Node 22 helper not found. Use: npx bobman-mcp %*
  exit /b 1
)
"%NODE22%" "%~dp0dist\cli\index.cjs" %*
