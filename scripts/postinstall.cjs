/* eslint-disable */
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

function tryLoad() {
  require("better-sqlite3");
  return true;
}

if (!tryLoad()) {
  const root = path.join(__dirname, "..");
  process.stderr.write(
    `bobman-mcp: rebuilding better-sqlite3 for Node ${process.version} (ABI ${process.versions.modules})…\n`,
  );
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCmd, ["rebuild", "better-sqlite3"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0 || !tryLoad()) {
    process.stderr.write(
      `bobman-mcp: better-sqlite3 failed for Node ${process.version}. ` +
        `Use Node 20/22 LTS or run: npm rebuild better-sqlite3\n` +
        `Windows Node 24: install Visual Studio C++ build tools — see docs/install-windows.md\n`,
    );
  }
}

process.exit(0);
