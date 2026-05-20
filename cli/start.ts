import path from "node:path";
import { createServer, installSignalHandlers } from "../src/server.js";
import { resolveDbPath } from "../src/state/db.js";
import { createStdioTransport } from "../src/transport/stdio.js";
import { logger } from "../src/lib/logger.js";

export async function runStart(repoPathArg?: string): Promise<void> {
  const repoPath = path.resolve(repoPathArg ?? process.cwd());
  const dbPath = resolveDbPath(repoPath);
  const { server, shutdown } = createServer({ dbPath });
  installSignalHandlers(shutdown);
  const transport = createStdioTransport();
  logger.info({ repoPath, dbPath }, "BobMan MCP server starting");
  await server.connect(transport);
}
