import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeRepo } from "../../src/analyzer/manager.js";
import { open, close, type BobmanDatabase } from "../../src/state/db.js";
import { createSession } from "../../src/state/session.js";
import { handleGetImpactMap } from "../../src/tools/get-impact-map.js";

interface ImpactResponse {
  resolved_targets: string[];
  nodes: { symbol_id: number; qualified_name: string; depth: number }[];
  edges: { from: number; to: number }[];
  truncated: boolean;
  dropped_outer_layer?: number;
}

describe("get_impact_map", () => {
  let dbDir: string;
  let db: BobmanDatabase;
  let repo: string;

  beforeEach(async () => {
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-im-db-"));
    db = open(path.join(dbDir, "d.db"));
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-im-repo-"));
    fs.writeFileSync(
      path.join(repo, "a.ts"),
      "export function root() { mid(); }\nexport function mid() { leaf(); }\nexport function leaf() {}\n",
    );
  });

  afterEach(() => {
    close(db);
    fs.rmSync(dbDir, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("returns callees with depth 1", async () => {
    const s = createSession(db, "test", repo);
    await analyzeRepo(db, s.session_id, repo);
    const res = handleGetImpactMap(
      { db },
      { session_id: s.session_id, target: "root", direction: "callees", depth: 1 },
    ) as ImpactResponse;
    expect(res.resolved_targets).toContain("a.ts::root");
    const names = res.nodes.map((n) => n.qualified_name);
    expect(names).toEqual(expect.arrayContaining(["a.ts::root", "a.ts::mid"]));
  });

  it("returns callers with depth 1", async () => {
    const s = createSession(db, "test", repo);
    await analyzeRepo(db, s.session_id, repo);
    const res = handleGetImpactMap(
      { db },
      { session_id: s.session_id, target: "leaf", direction: "callers", depth: 1 },
    ) as ImpactResponse;
    const names = res.nodes.map((n) => n.qualified_name);
    expect(names).toEqual(expect.arrayContaining(["a.ts::leaf", "a.ts::mid"]));
  });

  it("returns both directions with deeper traversal", async () => {
    const s = createSession(db, "test", repo);
    await analyzeRepo(db, s.session_id, repo);
    const res = handleGetImpactMap(
      { db },
      { session_id: s.session_id, target: "mid", direction: "both", depth: 2 },
    ) as ImpactResponse;
    const names = res.nodes.map((n) => n.qualified_name);
    expect(names).toEqual(
      expect.arrayContaining(["a.ts::root", "a.ts::mid", "a.ts::leaf"]),
    );
  });

  it("returns empty when target does not exist", async () => {
    const s = createSession(db, "test", repo);
    await analyzeRepo(db, s.session_id, repo);
    const res = handleGetImpactMap(
      { db },
      { session_id: s.session_id, target: "missing", direction: "both", depth: 2 },
    ) as ImpactResponse & { hint?: string };
    expect(res.nodes).toEqual([]);
    expect(res.hint).toBeDefined();
  });
});
