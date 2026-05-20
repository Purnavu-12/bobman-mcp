import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { connectTestClient, parseToolResult } from "./_client.js";

describe("bobman://health resource", () => {
  let shutdown: (() => void) | undefined;
  afterEach(() => {
    shutdown?.();
    shutdown = undefined;
  });

  it("reports zero sessions on a fresh server", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-health-"));
    const dbPath = path.join(dir, "h.db");
    const handle = createServer({ dbPath });
    shutdown = handle.shutdown;
    const client = await connectTestClient(handle.server);

    const res = await client.readResource({ uri: "bobman://health" });
    const text = (res.contents[0] as { text: string }).text;
    const body = JSON.parse(text) as {
      version: string;
      schema_version: number;
      sessions_total: number;
      sessions_active: number;
      db_path: string;
    };
    expect(body.sessions_total).toBe(0);
    expect(body.sessions_active).toBe(0);
    expect(body.version.length).toBeGreaterThan(0);
    expect(body.schema_version).toBeGreaterThan(0);
    expect(body.db_path).toBe(dbPath);

    await client.close();
  });

  it("counts an active session", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-health-2-"));
    const handle = createServer({ dbPath: path.join(dir, "h.db") });
    shutdown = handle.shutdown;
    const client = await connectTestClient(handle.server);

    await parseToolResult(
      await client.callTool({
        name: "create_session",
        arguments: { objective: "Health test" },
      }),
    );

    const res = await client.readResource({ uri: "bobman://health" });
    const body = JSON.parse((res.contents[0] as { text: string }).text) as {
      sessions_total: number;
      sessions_active: number;
    };
    expect(body.sessions_total).toBe(1);
    expect(body.sessions_active).toBe(1);

    await client.close();
  });
});
