import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import type { BobmanDatabase } from "../../src/state/db.js";
import { handleCreateSession } from "../../src/tools/create-session.js";
import { handleGetNextTask } from "../../src/tools/get-next-task.js";
import { handleSeedTaskGraph } from "../../src/tools/seed-task-graph.js";
import { connectTestClient, parseToolResult } from "./_client.js";
import { createTempDb } from "../helpers/db.js";

const THREE_TASKS = {
  tasks: [
    { task_id: "task-a", instruction: "A", acceptance_criteria: "A ok" },
    { task_id: "task-b", instruction: "B", acceptance_criteria: "B ok" },
    { task_id: "task-c", instruction: "C", acceptance_criteria: "C ok" },
  ],
  edges: [
    { from: "task-a", to: "task-b" },
    { from: "task-b", to: "task-c" },
  ],
};

async function runLoop(
  client: Awaited<ReturnType<typeof connectTestClient>>,
  sessionId: string,
  reportStatus: "DONE" | "FAILED" = "DONE",
  failTaskId?: string,
) {
  for (let i = 0; i < 3; i++) {
    const next = await parseToolResult<{ task_id: string; attempt: number }>(
      await client.callTool({ name: "get_next_task", arguments: { session_id: sessionId } }),
    );
    const status =
      failTaskId && next.task_id === failTaskId ? ("FAILED" as const) : reportStatus;
    await client.callTool({
      name: "report_complete",
      arguments: {
        session_id: sessionId,
        task_id: next.task_id,
        attempt: next.attempt,
        status,
        test_results: { total: 1, passed: status === "DONE" ? 1 : 0, failed: status === "DONE" ? 0 : 1, skipped: 0 },
      },
    });
  }
}

describe("closed-loop integration", () => {
  let shutdown: (() => void) | undefined;
  let dbPath: string;
  let db: BobmanDatabase | undefined;

  afterEach(() => {
    shutdown?.();
    shutdown = undefined;
  });

  function boot() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-loop-"));
    dbPath = path.join(dir, "loop.db");
    const handle = createServer({ dbPath });
    shutdown = handle.shutdown;
    db = handle.db;
    return handle;
  }

  it("completes a 3-task graph", async () => {
    const handle = boot();
    const client = await connectTestClient(handle.server);

    const created = await parseToolResult<{ session_id: string }>(
      await client.callTool({
        name: "create_session",
        arguments: { objective: "Closed loop" },
      }),
    );
    await client.callTool({
      name: "seed_task_graph",
      arguments: { session_id: created.session_id, ...THREE_TASKS },
    });
    await runLoop(client, created.session_id);

    const status = await parseToolResult<{ state: string }>(
      await client.callTool({
        name: "get_session_status",
        arguments: { session_id: created.session_id },
      }),
    );
    expect(status.state).toBe("COMPLETE");

    const exhausted = db!
      .prepare(`SELECT COUNT(*) AS c FROM events WHERE type = 'task_exhausted'`)
      .get() as { c: number };
    expect(exhausted.c).toBe(0);

    await client.close();
  });

  it("retries failed task then completes", async () => {
    const handle = boot();
    const client = await connectTestClient(handle.server);

    const created = await parseToolResult<{ session_id: string }>(
      await client.callTool({
        name: "create_session",
        arguments: { objective: "Retry loop" },
      }),
    );
    await client.callTool({
      name: "seed_task_graph",
      arguments: {
        session_id: created.session_id,
        tasks: [
          { task_id: "task-a", instruction: "A", acceptance_criteria: "A", max_attempts: 2 },
          { task_id: "task-b", instruction: "B", acceptance_criteria: "B" },
        ],
        edges: [{ from: "task-a", to: "task-b" }],
      },
    });

    const t1 = await parseToolResult<{ task_id: string; attempt: number }>(
      await client.callTool({
        name: "get_next_task",
        arguments: { session_id: created.session_id },
      }),
    );
    expect(t1.task_id).toBe("task-a");

    await client.callTool({
      name: "report_complete",
      arguments: {
        session_id: created.session_id,
        task_id: t1.task_id,
        attempt: t1.attempt,
        status: "FAILED",
      },
    });

    const t1retry = await parseToolResult<{ task_id: string; attempt: number }>(
      await client.callTool({
        name: "get_next_task",
        arguments: { session_id: created.session_id },
      }),
    );
    expect(t1retry.task_id).toBe("task-a");
    expect(t1retry.attempt).toBe(2);

    await client.callTool({
      name: "report_complete",
      arguments: {
        session_id: created.session_id,
        task_id: t1retry.task_id,
        attempt: t1retry.attempt,
        status: "DONE",
        test_results: { total: 1, passed: 1, failed: 0, skipped: 0 },
      },
    });

    const t2 = await parseToolResult<{ task_id: string; attempt: number }>(
      await client.callTool({
        name: "get_next_task",
        arguments: { session_id: created.session_id },
      }),
    );
    await client.callTool({
      name: "report_complete",
      arguments: {
        session_id: created.session_id,
        task_id: t2.task_id,
        attempt: t2.attempt,
        status: "DONE",
        test_results: { total: 1, passed: 1, failed: 0, skipped: 0 },
      },
    });

    const status = await parseToolResult<{ state: string }>(
      await client.callTool({
        name: "get_session_status",
        arguments: { session_id: created.session_id },
      }),
    );
    expect(status.state).toBe("COMPLETE");

    const retryEvent = db!
      .prepare(`SELECT COUNT(*) AS c FROM events WHERE type = 'retry_queued'`)
      .get() as { c: number };
    expect(retryEvent.c).toBeGreaterThan(0);

    await client.close();
  });

  it("exhausts middle task and blocks session", async () => {
    const handle = boot();
    const client = await connectTestClient(handle.server);

    const created = await parseToolResult<{ session_id: string }>(
      await client.callTool({
        name: "create_session",
        arguments: { objective: "Exhaustion" },
      }),
    );
    await client.callTool({
      name: "seed_task_graph",
      arguments: {
        session_id: created.session_id,
        tasks: [
          { task_id: "task-a", instruction: "A", acceptance_criteria: "A" },
          { task_id: "task-b", instruction: "B", acceptance_criteria: "B", max_attempts: 2 },
          { task_id: "task-c", instruction: "C", acceptance_criteria: "C" },
        ],
        edges: [
          { from: "task-a", to: "task-b" },
          { from: "task-b", to: "task-c" },
        ],
      },
    });

    const a = await parseToolResult<{ task_id: string; attempt: number }>(
      await client.callTool({
        name: "get_next_task",
        arguments: { session_id: created.session_id },
      }),
    );
    await client.callTool({
      name: "report_complete",
      arguments: {
        session_id: created.session_id,
        task_id: a.task_id,
        attempt: a.attempt,
        status: "DONE",
      },
    });

    for (let attempt = 1; attempt <= 2; attempt++) {
      const b = await parseToolResult<{ task_id: string; attempt: number }>(
        await client.callTool({
          name: "get_next_task",
          arguments: { session_id: created.session_id },
        }),
      );
      expect(b.task_id).toBe("task-b");
      await client.callTool({
        name: "report_complete",
        arguments: {
          session_id: created.session_id,
          task_id: b.task_id,
          attempt: b.attempt,
          status: "FAILED",
        },
      });
    }

    const status = await parseToolResult<{ state: string; blockers: { task_id: string }[] }>(
      await client.callTool({
        name: "get_session_status",
        arguments: { session_id: created.session_id },
      }),
    );
    expect(status.state).toBe("BLOCKED");
    expect(status.blockers.some((b) => b.task_id === "task-b")).toBe(true);

    const blockedNext = await client.callTool({
      name: "get_next_task",
      arguments: { session_id: created.session_id },
    });
    expect(blockedNext.isError).toBe(true);
    expect(JSON.parse((blockedNext.content as { text: string }[])[0].text).code).toBe(
      "INVALID_TRANSITION",
    );

    const exhausted = db!
      .prepare(`SELECT COUNT(*) AS c FROM events WHERE type = 'task_exhausted'`)
      .get() as { c: number };
    expect(exhausted.c).toBe(1);

    await client.close();
  });

  it("redacts secrets in report_complete", async () => {
    const handle = boot();
    const client = await connectTestClient(handle.server);

    const created = await parseToolResult<{ session_id: string }>(
      await client.callTool({
        name: "create_session",
        arguments: { objective: "Secret test" },
      }),
    );
    await client.callTool({
      name: "seed_task_graph",
      arguments: {
        session_id: created.session_id,
        tasks: [{ task_id: "only", instruction: "x", acceptance_criteria: "y" }],
        edges: [],
      },
    });
    const next = await parseToolResult<{ task_id: string; attempt: number }>(
      await client.callTool({
        name: "get_next_task",
        arguments: { session_id: created.session_id },
      }),
    );
    await parseToolResult<Record<string, unknown>>(
      await client.callTool({
        name: "report_complete",
        arguments: {
          session_id: created.session_id,
          task_id: next.task_id,
          attempt: next.attempt,
          status: "DONE",
          findings: { notes: "used Bearer eyJhbGciOi.test" },
        },
      }),
    );
    const row = db!
      .prepare(`SELECT findings_json FROM task_runs WHERE task_id = ? AND attempt = ?`)
      .get(next.task_id, next.attempt) as { findings_json: string };
    expect(row.findings_json).toContain("[REDACTED]");

    await client.close();
  });

  it("truncates file_scope under token budget", async () => {
    const { db, cleanup } = createTempDb();
    try {
      const created = handleCreateSession({ db }, { objective: "Budget test" });
      const file_scope = Array.from(
        { length: 50 },
        (_, i) => `src/${"x".repeat(180)}/subsystem-${i}/index.ts`,
      );
      handleSeedTaskGraph(
        { db },
        {
          session_id: created.session_id,
          tasks: [
            {
              task_id: "big-scope",
              instruction: "Implement the change in the listed files.",
              acceptance_criteria: "All tests pass.",
              file_scope,
            },
          ],
          edges: [],
        },
      );
      const next = handleGetNextTask({ db }, { session_id: created.session_id }) as {
        file_scope: string[];
        truncated?: { file_scope_dropped: number };
      };
      const tokens = Math.ceil(Buffer.byteLength(JSON.stringify(next), "utf8") / 4);
      expect(tokens).toBeLessThanOrEqual(2000);
      expect(next.truncated?.file_scope_dropped).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  it("crash-resumes AWAITING_REPORT session", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-crash-"));
    dbPath = path.join(dir, "crash.db");

    const handle1 = createServer({ dbPath });
    const client1 = await connectTestClient(handle1.server);
    const created = await parseToolResult<{ session_id: string }>(
      await client1.callTool({
        name: "create_session",
        arguments: { objective: "Crash resume" },
      }),
    );
    await client1.callTool({
      name: "seed_task_graph",
      arguments: { session_id: created.session_id, ...THREE_TASKS },
    });
    const dispatched = await parseToolResult<{ task_id: string; attempt: number }>(
      await client1.callTool({
        name: "get_next_task",
        arguments: { session_id: created.session_id },
      }),
    );
    await client1.close();
    handle1.shutdown();

    const handle2 = createServer({ dbPath });
    shutdown = handle2.shutdown;
    const client2 = await connectTestClient(handle2.server);

    const status = await parseToolResult<{
      state: string;
      in_flight: { task_id: string; attempt: number } | null;
    }>(
      await client2.callTool({
        name: "get_session_status",
        arguments: { session_id: created.session_id },
      }),
    );
    expect(status.state).toBe("AWAITING_REPORT");
    expect(status.in_flight?.task_id).toBe(dispatched.task_id);
    expect(status.in_flight?.attempt).toBe(dispatched.attempt);

    await client2.callTool({
      name: "report_complete",
      arguments: {
        session_id: created.session_id,
        task_id: dispatched.task_id,
        attempt: dispatched.attempt,
        status: "DONE",
        test_results: { total: 1, passed: 1, failed: 0, skipped: 0 },
      },
    });

    for (let i = 0; i < 2; i++) {
      const next = await parseToolResult<{ task_id: string; attempt: number }>(
        await client2.callTool({
          name: "get_next_task",
          arguments: { session_id: created.session_id },
        }),
      );
      await client2.callTool({
        name: "report_complete",
        arguments: {
          session_id: created.session_id,
          task_id: next.task_id,
          attempt: next.attempt,
          status: "DONE",
          test_results: { total: 1, passed: 1, failed: 0, skipped: 0 },
        },
      });
    }

    const final = await parseToolResult<{ state: string }>(
      await client2.callTool({
        name: "get_session_status",
        arguments: { session_id: created.session_id },
      }),
    );
    expect(final.state).toBe("COMPLETE");
    await client2.close();
  });
});
