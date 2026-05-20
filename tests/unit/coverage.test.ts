import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  discoverCoverageFiles,
  ingestCoverageForRepo,
  parseIstanbulFinal,
  parseLcov,
} from "../../src/lib/coverage.js";
import { close, open } from "../../src/state/db.js";
import { scoreFile } from "../../src/risk/score.js";

describe("coverage parser", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-cov-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("parses istanbul coverage-final.json", () => {
    const repo = path.join(tmp, "repo");
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    const srcFile = path.join(repo, "src", "a.ts");
    fs.writeFileSync(srcFile, "export const x = 1;\n");
    const covDir = path.join(repo, "coverage");
    fs.mkdirSync(covDir);
    fs.writeFileSync(
      path.join(covDir, "coverage-final.json"),
      JSON.stringify({
        [srcFile]: { lines: { total: 10, covered: 5, pct: 50 } },
      }),
    );
    const rows = parseIstanbulFinal(path.join(covDir, "coverage-final.json"), repo);
    expect(rows).toHaveLength(1);
    expect(rows[0].rel_path).toBe("src/a.ts");
    expect(rows[0].lines_pct).toBeCloseTo(0.5);
  });

  it("parses lcov.info", () => {
    const repo = path.join(tmp, "lcov-repo");
    fs.mkdirSync(repo, { recursive: true });
    const abs = path.join(repo, "lib.ts");
    fs.writeFileSync(abs, "x");
    fs.mkdirSync(path.join(repo, "coverage"), { recursive: true });
    fs.writeFileSync(
      path.join(repo, "coverage", "lcov.info"),
      `SF:${abs}\nLF:4\nLH:3\nend_of_record\n`,
    );
    const rows = parseLcov(path.join(repo, "coverage", "lcov.info"), repo);
    expect(rows[0].lines_pct).toBeCloseTo(0.75);
  });

  it("ingests coverage into SQLite and affects risk score", () => {
    const repo = path.join(tmp, "ingest");
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    const srcFile = path.join(repo, "src", "risk.ts");
    fs.writeFileSync(srcFile, "export function f() {}\n");
    fs.mkdirSync(path.join(repo, "coverage"));
    fs.writeFileSync(
      path.join(repo, "coverage", "coverage-final.json"),
      JSON.stringify({
        [srcFile]: { lines: { pct: 20 } },
      }),
    );
    const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-cov-db-"));
    const db = open(path.join(dbDir, "d.db"));
    const sessionId = "00000000-0000-4000-8000-000000000001";
    db.prepare(
      `INSERT INTO sessions (session_id, repo_path, objective, state, created_at, updated_at)
       VALUES (?, ?, 't', 'INIT', 1, 1)`,
    ).run(sessionId, repo);
    const r = ingestCoverageForRepo(db, sessionId, repo);
    expect(r.files_ingested).toBe(1);
    db.prepare(
      `INSERT INTO file_index (session_id, rel_path, language, status, analyzed_at)
       VALUES (?, 'src/risk.ts', 'typescript', 'ANALYZED', 1)`,
    ).run(sessionId);
    const score = scoreFile(db, sessionId, "src/risk.ts", { bypassCache: true });
    expect(score.coverage_gap).toBeCloseTo(0.8, 1);
    close(db);
    fs.rmSync(dbDir, { recursive: true, force: true });
  });

  it("discoverCoverageFiles finds default paths", () => {
    const repo = path.join(tmp, "disc");
    fs.mkdirSync(path.join(repo, "coverage"), { recursive: true });
    fs.writeFileSync(path.join(repo, "coverage", "lcov.info"), "SF:x\nend_of_record\n");
    const found = discoverCoverageFiles(repo);
    expect(found.some((p) => p.endsWith("lcov.info"))).toBe(true);
  });
});
