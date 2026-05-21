/* eslint-disable */
"use strict";

const { execSync } = require("node:child_process");

const MAX_BYTES = 5_000_000;
const REQUIRED_FILES = [
  "scripts/bobman-mcp-bin.cjs",
  "dist/cli/index.cjs",
  "dist/server.cjs",
  "docs/production.md",
  "AGENTS.md",
];

function main() {
  let raw;
  try {
    raw = execSync("npm pack --dry-run --json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
  } catch (err) {
    console.error("check-pack: npm pack failed:", err && err.message);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("check-pack: cannot parse npm pack JSON output:", err && err.message);
    process.exit(1);
  }

  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!entry) {
    console.error("check-pack: npm pack returned empty result");
    process.exit(1);
  }

  const files = (entry.files || []).map((f) => (f && f.path ? f.path : String(f)));
  const missing = REQUIRED_FILES.filter((req) => !files.some((f) => f === req || f.endsWith(req)));
  if (missing.length > 0) {
    console.error(`check-pack: required files missing from tarball: ${missing.join(", ")}`);
    process.exit(1);
  }

  const offenders = files.filter((f) => f.startsWith("node_modules/"));
  if (offenders.length > 0) {
    console.error(`check-pack: node_modules entries in tarball: ${offenders.slice(0, 5).join(", ")}`);
    process.exit(1);
  }

  const size = entry.size || entry.tarballBytes || entry.unpackedSize || 0;
  if (size > MAX_BYTES) {
    console.error(`check-pack: oversized tarball ${size} bytes (cap ${MAX_BYTES})`);
    process.exit(1);
  }

  console.log(
    `check-pack: OK (files=${files.length}, size=${size} bytes, name=${entry.name || "unknown"})`,
  );
}

main();
