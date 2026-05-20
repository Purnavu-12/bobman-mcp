import fs from "node:fs";
import path from "node:path";
import type { BobmanDatabase } from "../state/db.js";
import { nowMs } from "../state/db.js";
import { emitEvent } from "../state/session.js";

export interface FileCoverage {
  rel_path: string;
  lines_pct: number;
}

const DEFAULT_REL_PATHS = [
  "coverage/coverage-final.json",
  "coverage/lcov.info",
  "coverage/lcov-report/lcov.info",
];

export function discoverCoverageFiles(
  repoRoot: string,
  extraPaths: string[] = [],
): string[] {
  const candidates = [...extraPaths, ...DEFAULT_REL_PATHS];
  const found: string[] = [];
  for (const rel of candidates) {
    const abs = path.isAbsolute(rel) ? rel : path.join(repoRoot, rel);
    try {
      if (fs.statSync(abs).isFile()) found.push(abs);
    } catch {
      // skip
    }
  }
  return found;
}

function toRepoRel(repoRoot: string, filePath: string): string | null {
  const absRepo = path.resolve(repoRoot);
  const absFile = path.resolve(filePath);
  const rel = path.relative(absRepo, absFile);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.replace(/\\/g, "/");
}

export function parseIstanbulFinal(jsonPath: string, repoRoot: string): FileCoverage[] {
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as Record<
    string,
    { lines?: { pct?: number; covered?: number; total?: number } }
  >;
  const out: FileCoverage[] = [];
  for (const [key, entry] of Object.entries(raw)) {
    const rel = toRepoRel(repoRoot, key) ?? key.replace(/\\/g, "/");
    let pct = entry.lines?.pct;
    if (pct === undefined && entry.lines?.total) {
      pct = ((entry.lines.covered ?? 0) / entry.lines.total) * 100;
    }
    if (pct === undefined || Number.isNaN(pct)) continue;
    out.push({ rel_path: rel, lines_pct: Math.min(1, Math.max(0, pct / 100)) });
  }
  return out;
}

export function parseLcov(lcovPath: string, repoRoot: string): FileCoverage[] {
  const text = fs.readFileSync(lcovPath, "utf8");
  const out: FileCoverage[] = [];
  let currentFile: string | null = null;
  let lf = 0;
  let lh = 0;

  const flush = (): void => {
    if (!currentFile || lf <= 0) {
      currentFile = null;
      lf = 0;
      lh = 0;
      return;
    }
    const rel = toRepoRel(repoRoot, currentFile) ?? currentFile.replace(/\\/g, "/");
    out.push({
      rel_path: rel,
      lines_pct: Math.min(1, Math.max(0, lh / lf)),
    });
    currentFile = null;
    lf = 0;
    lh = 0;
  };

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      flush();
      currentFile = line.slice(3).trim();
    } else if (line === "end_of_record") {
      flush();
    } else if (line.startsWith("LF:")) {
      lf = parseInt(line.slice(3), 10) || 0;
    } else if (line.startsWith("LH:")) {
      lh = parseInt(line.slice(3), 10) || 0;
    }
  }
  flush();
  return out;
}

export function parseCoverageFile(absPath: string, repoRoot: string): FileCoverage[] {
  if (absPath.endsWith(".json")) {
    return parseIstanbulFinal(absPath, repoRoot);
  }
  if (absPath.endsWith(".info") || absPath.endsWith(".lcov")) {
    return parseLcov(absPath, repoRoot);
  }
  return [];
}

export function ingestCoverageForRepo(
  db: BobmanDatabase,
  sessionId: string,
  repoRoot: string,
  extraPaths: string[] = [],
): { files_ingested: number; source: string | null } {
  const files = discoverCoverageFiles(repoRoot, extraPaths);
  if (files.length === 0) {
    return { files_ingested: 0, source: null };
  }

  const merged = new Map<string, FileCoverage>();
  for (const f of files) {
    for (const row of parseCoverageFile(f, repoRoot)) {
      merged.set(row.rel_path, row);
    }
  }

  const ts = nowMs();
  const ins = db.prepare(
    `INSERT INTO coverage_snapshot (session_id, rel_path, lines_pct, source, ingested_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(session_id, rel_path) DO UPDATE SET
       lines_pct = excluded.lines_pct,
       source = excluded.source,
       ingested_at = excluded.ingested_at`,
  );

  const run = db.transaction(() => {
    for (const row of merged.values()) {
      ins.run(sessionId, row.rel_path, row.lines_pct, path.basename(files[0]), ts);
    }
  });
  run();

  return { files_ingested: merged.size, source: files[0] };
}

export function ingestCoverageForSession(
  db: BobmanDatabase,
  sessionId: string,
  repoRoots: { abs_path: string; label?: string }[],
  extraPaths: string[] = [],
): number {
  let total = 0;
  const multi = repoRoots.length > 1;
  for (const repo of repoRoots) {
    const files = discoverCoverageFiles(repo.abs_path, extraPaths);
    if (files.length === 0) continue;
    const merged = new Map<string, FileCoverage>();
    for (const f of files) {
      for (const row of parseCoverageFile(f, repo.abs_path)) {
        const rel = multi && repo.label ? `${repo.label}::${row.rel_path}` : row.rel_path;
        merged.set(rel, { rel_path: rel, lines_pct: row.lines_pct });
      }
    }
    const ts = nowMs();
    const ins = db.prepare(
      `INSERT INTO coverage_snapshot (session_id, rel_path, lines_pct, source, ingested_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session_id, rel_path) DO UPDATE SET
         lines_pct = excluded.lines_pct,
         source = excluded.source,
         ingested_at = excluded.ingested_at`,
    );
    const run = db.transaction(() => {
      for (const row of merged.values()) {
        ins.run(sessionId, row.rel_path, row.lines_pct, path.basename(files[0]), ts);
      }
    });
    run();
    total += merged.size;
  }
  if (total > 0) {
    emitEvent(db, sessionId, "coverage_ingested", { files_ingested: total });
  }
  return total;
}

export function coverageGapForFile(
  db: BobmanDatabase,
  sessionId: string,
  relPath: string,
): { gap: number; lines_pct: number | null; has_data: boolean } {
  const row = db
    .prepare(
      `SELECT lines_pct FROM coverage_snapshot
        WHERE session_id = ? AND rel_path = ?`,
    )
    .get(sessionId, relPath) as { lines_pct: number } | undefined;

  if (row) {
    return {
      gap: 1 - row.lines_pct,
      lines_pct: row.lines_pct,
      has_data: true,
    };
  }

  const bare = relPath.includes("::") ? relPath.split("::").slice(1).join("::") : relPath;
  if (bare !== relPath) {
    const row2 = db
      .prepare(
        `SELECT lines_pct FROM coverage_snapshot
          WHERE session_id = ? AND rel_path = ?`,
      )
      .get(sessionId, bare) as { lines_pct: number } | undefined;
    if (row2) {
      return {
        gap: 1 - row2.lines_pct,
        lines_pct: row2.lines_pct,
        has_data: true,
      };
    }
  }

  return { gap: 0.5, lines_pct: null, has_data: false };
}

export function invalidateCoverageSnapshot(db: BobmanDatabase, sessionId: string): void {
  db.prepare(`DELETE FROM coverage_snapshot WHERE session_id = ?`).run(sessionId);
  emitEvent(db, sessionId, "coverage_cache_invalidated", {});
}
