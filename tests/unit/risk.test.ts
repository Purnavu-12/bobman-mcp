import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeRepo } from "../../src/analyzer/manager.js";
import { gitIndex } from "../../src/git/indexer.js";
import { scoreFile, topRisks } from "../../src/risk/score.js";
import { open, close, type BobmanDatabase } from "../../src/state/db.js";
import { createSession, emitEvent } from "../../src/state/session.js";
import { handleGetRiskScore, handleGetTopRisks } from "../../src/tools/get-risk-score.js";

function run(cmd: string, cwd: string): void {
  execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-risk-"));
  run("git init -q", dir);
  run('git config user.email "test@example.com"', dir);
  run('git config user.name "Test"', dir);
  run("git config commit.gpgsign false", dir);
  return dir;
}

function commit(repo: string, file: string, content: string, message: string): void {
  fs.writeFileSync(path.join(repo, file), content);
  run(`git add ${file}`, repo);
  run(`git commit -q -m "${message}"`, repo);
}

describe("risk scoring", () => {
  let dbDir: string;
  let db: BobmanDatabase;
  let repo: string;

  beforeEach(async () => {
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-risk-db-"));
    db = open(path.join(dbDir, "d.db"));
    repo = makeRepo();
  });

  afterEach(() => {
    close(db);
    fs.rmSync(dbDir, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("scores a file with non-zero composite when churn and fan-in are present", async () => {
    fs.writeFileSync(
      path.join(repo, "lib.ts"),
      "export function used() {}\n",
    );
    fs.writeFileSync(
      path.join(repo, "client.ts"),
      "import { used } from './lib';\nexport function caller() { used(); }\n",
    );
    commit(repo, "lib.ts", "export function used() { return 1; }\n", "bump");
    commit(repo, "lib.ts", "export function used() { return 2; }\n", "bump2");

    const s = createSession(db, "t", repo);
    await analyzeRepo(db, s.session_id, repo);
    await gitIndex(db, s.session_id, repo, { windowDays: 365 });

    const score = scoreFile(db, s.session_id, "lib.ts");
    expect(score.churn).toBeGreaterThan(0);
    expect(score.composite).toBeGreaterThan(0);
  });

  it("cache TTL: bypass returns fresh value when forced", async () => {
    fs.writeFileSync(path.join(repo, "a.ts"), "export function f() {}\n");
    const s = createSession(db, "t", repo);
    await analyzeRepo(db, s.session_id, repo);
    const first = scoreFile(db, s.session_id, "a.ts");
    const fresh = scoreFile(db, s.session_id, "a.ts", { bypassCache: true });
    expect(fresh.computed_at).toBeGreaterThanOrEqual(first.computed_at);
  });

  it("risk_cache_invalidated event forces recompute", async () => {
    fs.writeFileSync(path.join(repo, "a.ts"), "export function f() {}\n");
    const s = createSession(db, "t", repo);
    await analyzeRepo(db, s.session_id, repo);
    const first = scoreFile(db, s.session_id, "a.ts");
    await new Promise((r) => setTimeout(r, 5));
    emitEvent(db, s.session_id, "risk_cache_invalidated", { source: "test" });
    const second = scoreFile(db, s.session_id, "a.ts");
    expect(second.computed_at).toBeGreaterThan(first.computed_at);
  });

  it("topRisks returns at most limit items", async () => {
    fs.writeFileSync(path.join(repo, "a.ts"), "export function a() {}\n");
    fs.writeFileSync(path.join(repo, "b.ts"), "export function b() {}\n");
    const s = createSession(db, "t", repo);
    await analyzeRepo(db, s.session_id, repo);
    const items = topRisks(db, s.session_id, 1, 90);
    expect(items.length).toBe(1);
  });

  it("get_risk_score tool returns a found:false hint for an unindexed symbol", async () => {
    const s = createSession(db, "t", repo);
    const res = handleGetRiskScore(
      { db },
      { session_id: s.session_id, component: "nope::missing", kind: "symbol", window_days: 90 },
    ) as { found?: boolean; hint?: string };
    expect(res.found).toBe(false);
  });

  it("get_top_risks returns an items array", async () => {
    fs.writeFileSync(path.join(repo, "a.ts"), "export function a() {}\n");
    const s = createSession(db, "t", repo);
    await analyzeRepo(db, s.session_id, repo);
    const res = handleGetTopRisks(
      { db },
      { session_id: s.session_id, limit: 5, window_days: 90 },
    ) as { items: unknown[] };
    expect(Array.isArray(res.items)).toBe(true);
  });
});
