import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { partitionByExistence, resolvePathAgainstRepo } from "../../src/lib/path-resolve.js";

function makeRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bobman-resolve-"));
}

describe("resolvePathAgainstRepo", () => {
  it("returns file for existing file inside repo", () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "README.md"), "hi");
    const r = resolvePathAgainstRepo(repo, "README.md");
    expect(r.exists).toBe(true);
    expect(r.kind).toBe("file");
    expect(r.error).toBeUndefined();
  });

  it("returns dir for existing directory", () => {
    const repo = makeRepo();
    fs.mkdirSync(path.join(repo, "src"));
    const r = resolvePathAgainstRepo(repo, "src");
    expect(r.exists).toBe(true);
    expect(r.kind).toBe("dir");
  });

  it("returns missing for non-existent path", () => {
    const repo = makeRepo();
    const r = resolvePathAgainstRepo(repo, "missing.txt");
    expect(r.exists).toBe(false);
    expect(r.kind).toBe("missing");
  });

  it("rejects outside-repo paths", () => {
    const repo = makeRepo();
    const r = resolvePathAgainstRepo(repo, "..\\..\\etc\\passwd");
    expect(r.exists).toBe(false);
    expect(r.error).toBe("outside_repo");
  });

  it("rejects absolute paths that escape the repo", () => {
    const repo = makeRepo();
    const escape = path.resolve(repo, "..", "outside.txt");
    const r = resolvePathAgainstRepo(repo, escape);
    expect(r.exists).toBe(false);
    expect(r.error).toBe("outside_repo");
  });

  it("treats symlinks as missing without following", () => {
    if (process.platform === "win32") {
      return;
    }
    const repo = makeRepo();
    const target = path.join(repo, "target.txt");
    fs.writeFileSync(target, "real");
    const link = path.join(repo, "link.txt");
    fs.symlinkSync(target, link);
    const r = resolvePathAgainstRepo(repo, "link.txt");
    expect(r.exists).toBe(false);
    expect(r.error).toBe("symlink");
  });
});

describe("partitionByExistence", () => {
  it("splits resolved entries by existence", () => {
    const { existing, missing } = partitionByExistence([
      { path: "a", abs_path: "/a", exists: true, kind: "file" },
      { path: "b", abs_path: "/b", exists: false, kind: "missing" },
      { path: "c", abs_path: "/c", exists: true, kind: "dir" },
    ]);
    expect(existing).toEqual(["a", "c"]);
    expect(missing).toEqual(["b"]);
  });
});
