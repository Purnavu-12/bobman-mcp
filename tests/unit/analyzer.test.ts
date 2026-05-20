import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeRepo } from "../../src/analyzer/manager.js";
import { detectLanguage, supportedLanguages } from "../../src/analyzer/registry.js";
import { open, close, type BobmanDatabase } from "../../src/state/db.js";
import { createSession } from "../../src/state/session.js";

describe("analyzer", () => {
  let dbDir: string;
  let db: BobmanDatabase;
  let repo: string;

  beforeEach(() => {
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-an-db-"));
    db = open(path.join(dbDir, "d.db"));
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-an-repo-"));
  });

  afterEach(() => {
    close(db);
    fs.rmSync(dbDir, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("registry reports tree-sitter grammars", () => {
    expect(supportedLanguages()).toEqual(
      expect.arrayContaining(["typescript", "python"]),
    );
    expect(detectLanguage("src/foo.ts")).toBe("typescript");
    expect(detectLanguage("src/foo.py")).toBe("python");
    expect(detectLanguage("src/foo.unknown")).toBeNull();
  });

  it("extracts TypeScript symbols and a local call edge", async () => {
    fs.writeFileSync(
      path.join(repo, "math.ts"),
      "export function add(a: number, b: number) { return a + b; }\n" +
        "export function add2(x: number) { return add(x, 2); }\n",
    );
    const s = createSession(db, "test", repo);
    const summary = await analyzeRepo(db, s.session_id, repo);
    expect(summary.files_analyzed).toBe(1);
    expect(summary.symbols).toBeGreaterThanOrEqual(2);
    expect(summary.edges).toBeGreaterThanOrEqual(1);

    const symbols = db
      .prepare(
        `SELECT name, kind, qualified_name FROM symbols
           WHERE file_id IN (SELECT file_id FROM file_index WHERE session_id = ?)`,
      )
      .all(s.session_id) as { name: string; kind: string; qualified_name: string }[];
    expect(symbols.map((r) => r.name)).toEqual(expect.arrayContaining(["add", "add2"]));

    const edges = db
      .prepare(
        `SELECT cg.to_symbol_id, cg.to_name_unresolved
           FROM call_graph cg
           JOIN symbols s_from ON s_from.symbol_id = cg.from_symbol_id
           JOIN file_index f ON f.file_id = s_from.file_id
          WHERE f.session_id = ?`,
      )
      .all(s.session_id) as { to_symbol_id: number | null; to_name_unresolved: string | null }[];
    expect(edges.length).toBeGreaterThanOrEqual(1);
  });

  it("extracts Python symbols", async () => {
    fs.writeFileSync(
      path.join(repo, "math.py"),
      "def add(a, b):\n    return a + b\n\nclass Calc:\n    def go(self):\n        return add(1, 2)\n",
    );
    const s = createSession(db, "test", repo);
    const summary = await analyzeRepo(db, s.session_id, repo);
    expect(summary.files_analyzed).toBe(1);
    expect(summary.symbols).toBeGreaterThanOrEqual(3);
  });

  it("marks .unknown files SKIPPED", async () => {
    fs.writeFileSync(path.join(repo, "x.unknown"), "garbage");
    const s = createSession(db, "test", repo);
    const summary = await analyzeRepo(db, s.session_id, repo);
    expect(summary.files_skipped).toBeGreaterThanOrEqual(1);
    expect(summary.files_analyzed).toBe(0);
  });

  it("respects paths scope", async () => {
    fs.mkdirSync(path.join(repo, "src"));
    fs.writeFileSync(path.join(repo, "src", "a.ts"), "export function f() {}\n");
    fs.writeFileSync(path.join(repo, "ignored.ts"), "export function g() {}\n");
    const s = createSession(db, "test", repo);
    const summary = await analyzeRepo(db, s.session_id, repo, { paths: ["src"] });
    expect(summary.files_analyzed).toBe(1);
  });
});
