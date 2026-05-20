import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureDbDirectory, resolveDbPath } from "../../src/state/db.js";
import { repoHash } from "../../src/lib/id.js";

describe("resolveDbPath", () => {
  const prevHome = process.env.BOBMAN_HOME;

  afterEach(() => {
    if (prevHome === undefined) {
      delete process.env.BOBMAN_HOME;
    } else {
      process.env.BOBMAN_HOME = prevHome;
    }
  });

  it("uses BOBMAN_HOME override", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-home-"));
    process.env.BOBMAN_HOME = tmp;
    const repo = path.join(tmp, "repo");
    fs.mkdirSync(repo, { recursive: true });
    const dbPath = resolveDbPath(repo);
    expect(dbPath).toBe(path.join(tmp, `${repoHash(repo)}.db`));
  });

  it("uses homedir/.bobman by default", () => {
    delete process.env.BOBMAN_HOME;
    const repo = path.resolve(os.tmpdir(), "bobman-repo-a");
    const dbPath = resolveDbPath(repo);
    expect(dbPath).toContain(path.join(".bobman", `${repoHash(repo)}.db`));
  });

  it("creates parent directory", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-mkdir-"));
    process.env.BOBMAN_HOME = tmp;
    const repo = path.join(tmp, "proj");
    const dbPath = resolveDbPath(repo);
    ensureDbDirectory(dbPath);
    expect(fs.existsSync(path.dirname(dbPath))).toBe(true);
  });

  it("distinct repos get distinct db files", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-hash-"));
    process.env.BOBMAN_HOME = tmp;
    const a = path.join(tmp, "a");
    const b = path.join(tmp, "b");
    expect(resolveDbPath(a)).not.toBe(resolveDbPath(b));
  });
});
