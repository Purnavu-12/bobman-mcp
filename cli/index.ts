import { runInit } from "./init.js";
import { runStart } from "./start.js";
import { runDoctor } from "./doctor.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sub = args[0] ?? "start";

  if (sub === "init") {
    runInit();
    return;
  }

  if (sub === "doctor") {
    const code = await runDoctor();
    process.exit(code);
  }

  if (sub === "start") {
    let repoPath: string | undefined;
    const repoIdx = args.indexOf("--repo-path");
    if (repoIdx >= 0 && args[repoIdx + 1]) {
      repoPath = args[repoIdx + 1];
    }
    let httpOptions: { host: string; port: number } | undefined;
    const httpIdx = args.indexOf("--http");
    if (httpIdx >= 0 && args[httpIdx + 1]) {
      const raw = args[httpIdx + 1];
      const m = /^:?(\d{1,5})$/.exec(raw);
      const port = m ? parseInt(m[1], 10) : NaN;
      if (!Number.isFinite(port) || port < 1 || port > 65535) {
        process.stderr.write(`Invalid --http port: ${raw}\n`);
        process.exit(1);
      }
      const hostIdx = args.indexOf("--host");
      const host = hostIdx >= 0 && args[hostIdx + 1] ? args[hostIdx + 1] : "127.0.0.1";
      httpOptions = { host, port };
    } else if (process.env.BOBMAN_HTTP_PORT) {
      const port = parseInt(process.env.BOBMAN_HTTP_PORT, 10);
      if (Number.isFinite(port)) httpOptions = { host: "127.0.0.1", port };
    }
    await runStart(repoPath, httpOptions);
    return;
  }

  process.stderr.write(
    `Unknown subcommand: ${sub}\n` +
      "Usage: bobman-mcp [init|start|doctor] [--repo-path <path>] [--http :PORT] [--host 0.0.0.0]\n",
  );
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(String(err) + "\n");
  process.exit(1);
});
