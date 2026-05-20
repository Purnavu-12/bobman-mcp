import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { close, open, type BobmanDatabase } from "./state/db.js";
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

export function createServer(options: { dbPath: string }): ServerHandle {
  const db = open(options.dbPath);
  let shuttingDown = false;

  const deps: ToolDeps = {
    db,
    shuttingDown: () => shuttingDown,
  };

  const server = new McpServer({
    name: "bobman-mcp",
    version: readPackageVersion(),
  });

  registerAllTools(server, deps);

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
