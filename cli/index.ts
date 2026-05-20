#!/usr/bin/env node
import { runInit } from "./init.js";
import { runStart } from "./start.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sub = args[0] ?? "start";

  if (sub === "init") {
    runInit();
    return;
  }

  if (sub === "start") {
    let repoPath: string | undefined;
    const repoIdx = args.indexOf("--repo-path");
    if (repoIdx >= 0 && args[repoIdx + 1]) {
      repoPath = args[repoIdx + 1];
    }
    await runStart(repoPath);
    return;
  }

  process.stderr.write(`Unknown subcommand: ${sub}\nUsage: bobman-mcp [init|start] [--repo-path <path>]\n`);
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(String(err) + "\n");
  process.exit(1);
});
