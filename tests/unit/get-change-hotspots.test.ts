import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { open, close, type BobmanDatabase } from "../../src/state/db.js";
import { createSession } from "../../src/state/session.js";
import { handleGetChangeHotspots } from "../../src/tools/get-change-hotspots.js";

function run(cmd: string, cwd: string): void {
  execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-hot-"));
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

describe("get_change_hotspots tool", () => {
  let dbDir: string;
  let db: BobmanDatabase;

  beforeEach(() => {
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-hot-db-"));
    db = open(path.join(dbDir, "d.db"));
  });

  afterEach(() => {
    close(db);
    fs.rmSync(dbDir, { recursive: true, force: true });
  });

  it("auto-indexes on first call and reports hotspots in commit-count order", async () => {
    const repo = makeRepo();
    commit(repo, "hot.ts", "1\n", "h1");
    commit(repo, "hot.ts", "2\n", "h2");
    commit(repo, "hot.ts", "3\n", "h3");
    commit(repo, "cool.ts", "1\n", "c1");

    const s = createSession(db, "test", repo);
    const res = (await handleGetChangeHotspots(
      { db },
      { session_id: s.session_id, window_days: 365, limit: 10 },
    )) as { hotspots: { rel_path: string; commits: number }[] };

    expect(res.hotspots[0].rel_path).toBe("hot.ts");
    expect(res.hotspots[0].commits).toBe(3);
    expect(res.hotspots[1].rel_path).toBe("cool.ts");

    fs.rmSync(repo, { recursive: true, force: true });
  });
});
