import path from "node:path";
import { createServer, installSignalHandlers } from "../src/server.js";
import { BobmanError } from "../src/lib/errors.js";
import { loadConfig } from "../src/lib/config.js";
import { resolveDbPath } from "../src/state/db.js";
import { createStdioTransport } from "../src/transport/stdio.js";
import { logger } from "../src/lib/logger.js";

export async function runStart(repoPathArg?: string): Promise<void> {
  const repoPath = path.resolve(repoPathArg ?? process.cwd());

  let loaded;
  try {
    loaded = loadConfig(repoPath);
  } catch (err) {
    if (err instanceof BobmanError) {
      const details = err.details as { path?: string; reason?: string } | undefined;
      const where = details?.path ?? path.join(repoPath, "bobman.config.json");
      process.stderr.write(
        `bobman-mcp: failed to load ${where} (${details?.reason ?? "invalid"}): ${err.message}\n`,
      );
      process.exit(1);
    }
    throw err;
  }

  const { config, source } = loaded;
  logger.level = config.logLevel;

  let dbPath: string;
  if (config.dbPath) {
    dbPath = path.isAbsolute(config.dbPath) ? config.dbPath : path.resolve(repoPath, config.dbPath);
  } else {
    dbPath = resolveDbPath(repoPath);
  }

  const { server, shutdown } = createServer({
    dbPath,
    defaultMaxAttempts: config.maxAttempts,
    strictFileScope: config.strictFileScope,
  });
  installSignalHandlers(shutdown);
  const transport = createStdioTransport();
  logger.info(
    { repoPath, dbPath, configSource: source, logLevel: config.logLevel },
    "BobMan MCP server starting",
  );
  await server.connect(transport);
}
