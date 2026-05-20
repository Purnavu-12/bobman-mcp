import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BobmanError } from "../../src/lib/errors.js";
import { open, close, type BobmanDatabase } from "../../src/state/db.js";
import { createSession } from "../../src/state/session.js";
import { handleAddKnowledge } from "../../src/tools/add-knowledge.js";
import { handleQueryKnowledge } from "../../src/tools/query-knowledge.js";

interface AddRes {
  entry_id: number;
  created_at: number;
}

interface QueryRes {
  entries: { entry_id: number; kind: string; snippet: string; score: number }[];
}

describe("knowledge base", () => {
  let dbDir: string;
  let db: BobmanDatabase;

  beforeEach(() => {
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-kb-"));
    db = open(path.join(dbDir, "d.db"));
  });

  afterEach(() => {
    close(db);
    fs.rmSync(dbDir, { recursive: true, force: true });
  });

  it("add_knowledge persists and FTS5 finds it", () => {
    const s = createSession(db, "test", dbDir);
    const added = handleAddKnowledge(
      { db },
      {
        session_id: s.session_id,
        kind: "decision",
        title: "Cache policy",
        body: "we cache GET /users for 60s using lru-cache",
      },
    ) as AddRes;
    expect(added.entry_id).toBeGreaterThan(0);

    const res = handleQueryKnowledge(
      { db },
      { session_id: s.session_id, q: "lru-cache" },
    ) as QueryRes;
    expect(res.entries.length).toBeGreaterThanOrEqual(1);
    expect(res.entries[0].snippet).toContain("[lru-cache]");
  });

  it("filters by kind", () => {
    const s = createSession(db, "test", dbDir);
    handleAddKnowledge(
      { db },
      { session_id: s.session_id, kind: "warning", title: "API rate", body: "limit 100/s" },
    );
    handleAddKnowledge(
      { db },
      { session_id: s.session_id, kind: "fact", title: "DB host", body: "limit on production" },
    );
    const res = handleQueryKnowledge(
      { db },
      { session_id: s.session_id, q: "limit", kind: "warning" },
    ) as QueryRes;
    expect(res.entries.every((e) => e.kind === "warning")).toBe(true);
    expect(res.entries.length).toBe(1);
  });

  it("DELETE from knowledge_entries removes the FTS row", () => {
    const s = createSession(db, "test", dbDir);
    const added = handleAddKnowledge(
      { db },
      { session_id: s.session_id, kind: "fact", title: "x", body: "deletable contents" },
    ) as AddRes;
    db.prepare(`DELETE FROM knowledge_entries WHERE entry_id = ?`).run(added.entry_id);
    const res = handleQueryKnowledge(
      { db },
      { session_id: s.session_id, q: "deletable" },
    ) as QueryRes;
    expect(res.entries.length).toBe(0);
  });

  it("rejects invalid kind via Zod (thrown synchronously)", () => {
    const s = createSession(db, "test", dbDir);
    expect(() =>
      handleAddKnowledge(
        { db },
        { session_id: s.session_id, kind: "garbage", title: "x", body: "y" },
      ),
    ).toThrow();
  });

  it("unknown session returns NOT_FOUND", () => {
    expect(() =>
      handleAddKnowledge(
        { db },
        {
          session_id: "00000000-0000-0000-0000-000000000000",
          kind: "fact",
          title: "x",
          body: "y",
        },
      ),
    ).toThrow(BobmanError);
  });
});
