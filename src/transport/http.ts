import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import { KNOWN_SCHEMA_VERSION } from "../state/db.js";
import type { ServerHandle } from "../server.js";

export interface HttpServerOptions {
  host: string;
  port: number;
  token?: string;
  handle: ServerHandle;
  version: string;
  startedAt: number;
}

export interface HttpServerControl {
  close: () => Promise<void>;
  address: () => { host: string; port: number };
}

function unauthorized(res: ServerResponse): void {
  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "unauthorized" }));
}

function checkToken(req: IncomingMessage, expected?: string): boolean {
  if (!expected) return true;
  const header = req.headers["authorization"];
  if (typeof header !== "string") return false;
  const m = /^Bearer\s+(.+)$/.exec(header.trim());
  if (!m) return false;
  return m[1] === expected;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (chunks.length === 0) return resolve(undefined);
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text.length === 0 ? undefined : JSON.parse(text));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function healthBody(handle: ServerHandle, version: string, startedAt: number): string {
  const total = (handle.db.prepare(`SELECT COUNT(*) AS c FROM sessions`).get() as { c: number }).c;
  const active = (
    handle.db
      .prepare(
        `SELECT COUNT(*) AS c FROM sessions WHERE state NOT IN ('COMPLETE', 'BLOCKED')`,
      )
      .get() as { c: number }
  ).c;
  return JSON.stringify({
    version,
    schema_version: KNOWN_SCHEMA_VERSION,
    sessions_total: total,
    sessions_active: active,
    started_at: startedAt,
  });
}

export async function startHttpServer(options: HttpServerOptions): Promise<HttpServerControl> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await options.handle.server.connect(transport);

  const server = http.createServer(async (req, res) => {
    if (!checkToken(req, options.token)) {
      unauthorized(res);
      return;
    }
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(healthBody(options.handle, options.version, options.startedAt));
      return;
    }

    if (url.pathname === "/mcp") {
      try {
        const body = req.method === "POST" ? await readBody(req) : undefined;
        await transport.handleRequest(req, res, body);
      } catch (err) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: "transport_error",
              message: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      }
      return;
    }

    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "not_found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const portBound =
    typeof address === "object" && address !== null ? address.port : options.port;
  return {
    close: () =>
      new Promise<void>((resolve) => {
        void transport.close();
        server.close(() => resolve());
      }),
    address: () => ({ host: options.host, port: portBound ?? options.port }),
  };
}
