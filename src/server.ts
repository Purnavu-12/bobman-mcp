import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { close, KNOWN_SCHEMA_VERSION, open, type BobmanDatabase } from "./state/db.js";
import { registerAllTools } from "./tools/index.js";
import type { ToolDeps } from "./tools/deps.js";
import { logger } from "./lib/logger.js";

function readPackageVersion(): string {
  try {
    const base =
      typeof import.meta !== "undefined" && import.meta.url
        ? path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
        : process.cwd();
    const pkgPath = path.join(base, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

export interface ServerHandle {
  server: McpServer;
  db: BobmanDatabase;
  deps: ToolDeps;
  shutdown: () => void;
}

export interface CreateServerOptions {
  dbPath: string;
  defaultMaxAttempts?: number;
  strictFileScope?: boolean;
}

export function createServer(options: CreateServerOptions): ServerHandle {
  const db = open(options.dbPath);
  let shuttingDown = false;

  const deps: ToolDeps = {
    db,
    shuttingDown: () => shuttingDown,
    defaultMaxAttempts: options.defaultMaxAttempts,
    strictFileScope: options.strictFileScope,
  };

  const server = new McpServer({
    name: "bobman-mcp",
    version: readPackageVersion(),
  });

  registerAllTools(server, deps);

  const startedAt = Date.now();
  const version = readPackageVersion();

  server.registerResource(
    "bobman-health",
    "bobman://health",
    {
      description: "BobMan environment health snapshot (version, schema_version, db_path, session counts).",
      mimeType: "application/json",
    },
    async () => {
      const sessionsTotal = (
        db.prepare(`SELECT COUNT(*) AS c FROM sessions`).get() as { c: number }
      ).c;
      const sessionsActive = (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM sessions WHERE state NOT IN ('COMPLETE', 'BLOCKED')`,
          )
          .get() as { c: number }
      ).c;
      const body = {
        version,
        schema_version: KNOWN_SCHEMA_VERSION,
        db_path: options.dbPath,
        sessions_total: sessionsTotal,
        sessions_active: sessionsActive,
        started_at: startedAt,
      };
      return {
        contents: [
          {
            uri: "bobman://health",
            mimeType: "application/json",
            text: JSON.stringify(body),
          },
        ],
      };
    },
  );

  const shutdown = () => {
    shuttingDown = true;
    close(db);
  };

  return { server, db, deps, shutdown };
}

export function installSignalHandlers(shutdown: () => void): void {
  const onSignal = () => {
    logger.info("Shutting down BobMan MCP server");
    shutdown();
    process.exit(0);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
}
