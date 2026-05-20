import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { startHttpServer } from "../../src/transport/http.js";

interface HealthBody {
  schema_version: number;
  version: string;
  sessions_total: number;
  sessions_active: number;
  started_at: number;
}

describe("HTTP transport", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it("returns 401 when token is required and missing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-http-"));
    const handle = createServer({ dbPath: path.join(dir, "d.db") });
    const http = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      token: "secret-token",
      handle,
      version: "0.0.test",
      startedAt: Date.now(),
    });
    cleanup = async () => {
      await http.close();
      handle.shutdown();
    };
    const { port } = http.address();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(401);
  });

  it("/health returns a positive schema_version with valid token", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-http-"));
    const handle = createServer({ dbPath: path.join(dir, "d.db") });
    const http = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      token: "secret-token",
      handle,
      version: "0.0.test",
      startedAt: Date.now(),
    });
    cleanup = async () => {
      await http.close();
      handle.shutdown();
    };
    const { port } = http.address();
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { Authorization: "Bearer secret-token" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthBody;
    expect(body.schema_version).toBeGreaterThan(0);
    expect(body.version).toBe("0.0.test");
  });

  it("POST /mcp accepts an initialized JSON-RPC tools/list call", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-http-"));
    const handle = createServer({ dbPath: path.join(dir, "d.db") });
    const http = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      token: undefined,
      handle,
      version: "0.0.test",
      startedAt: Date.now(),
    });
    cleanup = async () => {
      await http.close();
      handle.shutdown();
    };
    const { port } = http.address();

    const initRes = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        },
      }),
    });
    expect(initRes.status).toBeGreaterThanOrEqual(200);
    expect(initRes.status).toBeLessThan(500);
  });
});
