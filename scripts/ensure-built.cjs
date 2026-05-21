"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const entry = path.join(__dirname, "..", "dist", "cli", "index.cjs");
if (!fs.existsSync(entry)) {
  console.log("ensure-built: dist/cli/index.cjs missing — running npm run build");
  execSync("npm run build", { stdio: "inherit", cwd: path.join(__dirname, "..") });
}
