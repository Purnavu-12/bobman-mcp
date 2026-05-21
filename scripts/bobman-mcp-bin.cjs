#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const cliEntry = path.join(__dirname, "..", "dist", "cli", "index.cjs");
const args = process.argv.slice(2);

function cursorNodeOnWindows() {
  if (process.platform !== "win32") return null;
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;
  const candidate = path.join(
    localAppData,
    "Programs",
    "cursor",
    "resources",
    "app",
    "resources",
    "helpers",
    "node.exe",
  );
  return fs.existsSync(candidate) ? candidate : null;
}

function run(nodeExecutable) {
  const result = spawnSync(nodeExecutable, [cliEntry, ...args], {
    stdio: "inherit",
    env: process.env,
    windowsHide: true,
  });
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

const cursorNode = cursorNodeOnWindows();
if (cursorNode) {
  run(cursorNode);
} else {
  run(process.execPath);
}
