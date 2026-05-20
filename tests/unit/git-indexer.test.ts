import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gitIndex } from "../../src/git/indexer.js";
import { open, close, type BobmanDatabase } from "../../src/state/db.js";
import { createSession } from "../../src/state/session.js";

function run(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-git-"));
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

describe("gitIndex", () => {
  let dbDir: string;
  let db: BobmanDatabase;

  beforeEach(() => {
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-gitidx-"));
    db = open(path.join(dbDir, "d.db"));
  });

  afterEach(() => {
    close(db);
    fs.rmSync(dbDir, { recursive: true, force: true });
  });

  it("indexes commits and file changes from a real repo", async () => {
    const repo = makeRepo();
    commit(repo, "a.ts", "export const a = 1;\n", "add a");
    commit(repo, "b.ts", "export const b = 2;\n", "add b");
    commit(repo, "a.ts", "export const a = 2;\n", "bump a");

    const s = createSession(db, "test", repo);
    const result = await gitIndex(db, s.session_id, repo, { windowDays: 365 });

    expect(result.commits_added).toBe(3);
    expect(result.files_touched).toBeGreaterThanOrEqual(3);

    const commits = db
      .prepare(`SELECT COUNT(*) AS c FROM commits WHERE session_id = ?`)
      .get(s.session_id) as { c: number };
    expect(commits.c).toBe(3);

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("incremental run skips already-indexed commits", async () => {
    const repo = makeRepo();
    commit(repo, "a.ts", "1\n", "c1");
    commit(repo, "a.ts", "2\n", "c2");

    const s = createSession(db, "test", repo);
    const first = await gitIndex(db, s.session_id, repo, { windowDays: 365 });
    expect(first.commits_added).toBe(2);

    const second = await gitIndex(db, s.session_id, repo, { windowDays: 365 });
    expect(second.commits_added).toBe(0);

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("returns zero on non-git directory without throwing", async () => {
    const nonRepo = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-nogit-"));
    const s = createSession(db, "test", nonRepo);
    const result = await gitIndex(db, s.session_id, nonRepo, { windowDays: 90 });
    expect(result.commits_added).toBe(0);
    fs.rmSync(nonRepo, { recursive: true, force: true });
  });

  it("leaves blame_cache empty unless cache_blame is true", async () => {
    const repo = makeRepo();
    commit(repo, "a.ts", "1\n", "c1");
    const s = createSession(db, "test", repo);
    await gitIndex(db, s.session_id, repo, { windowDays: 365 });
    const blame = db
      .prepare(`SELECT COUNT(*) AS c FROM blame_cache WHERE session_id = ?`)
      .get(s.session_id) as { c: number };
    expect(blame.c).toBe(0);
    fs.rmSync(repo, { recursive: true, force: true });
  });
});
