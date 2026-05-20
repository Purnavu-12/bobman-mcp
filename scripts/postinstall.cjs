/* eslint-disable */
"use strict";

try {
  require("better-sqlite3");
} catch (err) {
  const node = process.version;
  const abi = process.versions.modules;
  const msg = `bobman-mcp: better-sqlite3 native binding failed to load (Node ${node}, ABI ${abi}). Run: npm rebuild better-sqlite3`;
  process.stderr.write(msg + "\n");
}

process.exit(0);
