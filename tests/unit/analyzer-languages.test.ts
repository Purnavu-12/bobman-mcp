import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeRepo } from "../../src/analyzer/manager.js";
import { supportedLanguages } from "../../src/analyzer/registry.js";
import { open, close, type BobmanDatabase } from "../../src/state/db.js";
import { createSession } from "../../src/state/session.js";

interface SymbolRow {
  name: string;
  kind: string;
  qualified_name: string;
}

function symbolsFor(db: BobmanDatabase, sessionId: string): SymbolRow[] {
  return db
    .prepare(
      `SELECT s.name, s.kind, s.qualified_name FROM symbols s
         JOIN file_index f ON f.file_id = s.file_id
        WHERE f.session_id = ?`,
    )
    .all(sessionId) as SymbolRow[];
}

describe("multi-language analyzer", () => {
  let dbDir: string;
  let db: BobmanDatabase;
  let repo: string;

  beforeEach(() => {
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-lang-db-"));
    db = open(path.join(dbDir, "d.db"));
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-lang-repo-"));
  });

  afterEach(() => {
    close(db);
    fs.rmSync(dbDir, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("registry reports go, java, rust", () => {
    expect(supportedLanguages()).toEqual(
      expect.arrayContaining(["go", "java", "rust"]),
    );
  });

  it("extracts Go function and method", async () => {
    fs.writeFileSync(
      path.join(repo, "x.go"),
      "package main\n\nfunc Foo() int { return 1 }\n\ntype R struct{}\n\nfunc (r *R) Bar() int { return Foo() }\n",
    );
    const s = createSession(db, "test", repo);
    await analyzeRepo(db, s.session_id, repo);
    const syms = symbolsFor(db, s.session_id);
    const kinds = new Set(syms.map((r) => r.kind));
    expect(kinds.has("function")).toBe(true);
    expect(kinds.has("method")).toBe(true);
  });

  it("extracts Java class and method", async () => {
    fs.writeFileSync(
      path.join(repo, "A.java"),
      "class A { void m() {} void n() { m(); } }\n",
    );
    const s = createSession(db, "test", repo);
    await analyzeRepo(db, s.session_id, repo);
    const syms = symbolsFor(db, s.session_id);
    expect(syms.some((r) => r.kind === "class" && r.name === "A")).toBe(true);
    expect(syms.some((r) => r.kind === "method")).toBe(true);
  });

  it("extracts Rust function and impl method", async () => {
    fs.writeFileSync(
      path.join(repo, "lib.rs"),
      "pub fn outer() { inner(); }\npub fn inner() {}\nstruct Foo;\nimpl Foo { pub fn run(&self) { inner(); } }\n",
    );
    const s = createSession(db, "test", repo);
    await analyzeRepo(db, s.session_id, repo);
    const syms = symbolsFor(db, s.session_id);
    expect(syms.some((r) => r.name === "outer")).toBe(true);
    expect(syms.some((r) => r.name === "inner")).toBe(true);
  });

  it("languages_supported reports go/java/rust", async () => {
    const s = createSession(db, "test", repo);
    const summary = await analyzeRepo(db, s.session_id, repo);
    expect(summary.languages_supported).toEqual(
      expect.arrayContaining(["go", "java", "rust", "typescript", "python"]),
    );
  });
});
