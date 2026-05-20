import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer, installSignalHandlers } from "../src/server.js";
import { BobmanError } from "../src/lib/errors.js";
import { loadConfig } from "../src/lib/config.js";
import { resolveDbPath } from "../src/state/db.js";
import { createStdioTransport } from "../src/transport/stdio.js";
import { startHttpServer } from "../src/transport/http.js";
import { logger } from "../src/lib/logger.js";

export interface StartOptions {
  repoPath?: string;
  http?: { host: string; port: number } | null;
}

function readPkgVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(path.join(here, "..", "package.json"), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

export async function runStart(
  repoPathArg?: string,
  httpOptions?: { host: string; port: number },
): Promise<void> {
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

  const handle = createServer({
    dbPath,
    defaultMaxAttempts: config.maxAttempts,
    strictFileScope: config.strictFileScope,
  });
  installSignalHandlers(handle.shutdown);

  if (httpOptions) {
    const token = process.env.BOBMAN_TOKEN;
    if (httpOptions.host !== "127.0.0.1" && httpOptions.host !== "localhost" && !token) {
      process.stderr.write(
        "BOBMAN_TOKEN must be set when binding to a non-loopback host. Refusing to start.\n",
      );
      handle.shutdown();
      process.exit(1);
    }
    const httpServer = await startHttpServer({
      host: httpOptions.host,
      port: httpOptions.port,
      token,
      handle,
      version: readPkgVersion(),
      startedAt: Date.now(),
    });
    const bound = httpServer.address();
    logger.info(
      {
        repoPath,
        dbPath,
        configSource: source,
        logLevel: config.logLevel,
        transport: "http",
        host: bound.host,
        port: bound.port,
      },
      "BobMan MCP server starting (HTTP)",
    );
    process.once("SIGINT", () => void httpServer.close());
    process.once("SIGTERM", () => void httpServer.close());
    return;
  }

  const transport = createStdioTransport();
  logger.info(
    { repoPath, dbPath, configSource: source, logLevel: config.logLevel, transport: "stdio" },
    "BobMan MCP server starting",
  );
  await handle.server.connect(transport);
}
