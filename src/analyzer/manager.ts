import fs from "node:fs";
import path from "node:path";
import type { BobmanDatabase } from "../state/db.js";
import { nowMs } from "../state/db.js";
import { emitEvent } from "../state/session.js";
import { extractGo } from "./extractors/go.js";
import { extractJava } from "./extractors/java.js";
import { extractPython } from "./extractors/python.js";
import { extractRust } from "./extractors/rust.js";
import { extractTypescript } from "./extractors/typescript.js";
import type { ExtractedFile, SyntaxNode } from "./extractors/common.js";
import { detectLanguage, supportedLanguages, type Language } from "./registry.js";
import { ParserPool } from "./parser-pool.js";

const BATCH_SIZE = parseInt(process.env.BOBMAN_ANALYZER_BATCH_SIZE ?? "100", 10);
const MAX_FILE_BYTES = 1024 * 1024;

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".bobman",
  "coverage",
  "vendor",
  "target",
  ".venv",
  "__pycache__",
]);

export interface AnalyzeRepoOptions {
  paths?: string[];
  force?: boolean;
  /** Prepended to each stored rel_path (e.g. `web::`) for multi-repo sessions. */
  pathPrefix?: string;
  /** Cap files scanned (0 = unlimited). */
  maxFiles?: number;
}

export interface AnalyzeRepoSummary {
  files_analyzed: number;
  files_skipped: number;
  files_failed: number;
  symbols: number;
  edges: number;
  worker_restarts: number;
  duration_ms: number;
  languages_supported: Language[];
}

function listCandidates(rootAbs: string, scope?: string[]): string[] {
  const results: string[] = [];
  const visit = (relDir: string): void => {
    const abs = path.join(rootAbs, relDir);
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = relDir === "" ? e.name : `${relDir}/${e.name}`;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (IGNORED_DIRS.has(e.name)) continue;
        visit(rel);
      } else if (e.isFile()) {
        results.push(rel);
      }
    }
  };

  if (scope && scope.length > 0) {
    for (const p of scope) {
      const abs = path.join(rootAbs, p);
      try {
        const st = fs.statSync(abs);
        if (st.isDirectory()) {
          visit(p);
        } else if (st.isFile()) {
          results.push(p);
        }
      } catch {
        // skip missing path
      }
    }
  } else {
    visit("");
  }
  return results;
}

function pickExtractor(language: Language): ((root: SyntaxNode, relPath: string) => ExtractedFile) | null {
  switch (language) {
    case "typescript":
    case "tsx":
      return extractTypescript;
    case "python":
      return extractPython;
    case "go":
      return extractGo;
    case "java":
      return extractJava;
    case "rust":
      return extractRust;
    default:
      return null;
  }
}

export async function analyzeRepo(
  db: BobmanDatabase,
  sessionId: string,
  repoPath: string,
  options: AnalyzeRepoOptions = {},
): Promise<AnalyzeRepoSummary> {
  const started = nowMs();
  const rootAbs = path.resolve(repoPath);
  let candidates = listCandidates(rootAbs, options.paths);
  if (options.maxFiles && options.maxFiles > 0 && candidates.length > options.maxFiles) {
    candidates = candidates.slice(0, options.maxFiles);
  }

  let filesAnalyzed = 0;
  let filesSkipped = 0;
  let filesFailed = 0;
  let symbolCount = 0;
  let edgeCount = 0;

  const insertFile = db.prepare(
    `INSERT INTO file_index (session_id, rel_path, language, status, analyzed_at)
     VALUES (?, ?, ?, 'PENDING', ?)
     ON CONFLICT(session_id, rel_path) DO UPDATE
       SET status = excluded.status, language = excluded.language, analyzed_at = excluded.analyzed_at
     RETURNING file_id`,
  );
  const updateFileStatus = db.prepare(
    `UPDATE file_index SET status = ?, analyzed_at = ? WHERE file_id = ?`,
  );
  const insertSymbol = db.prepare(
    `INSERT INTO symbols (file_id, name, kind, line_start, line_end, qualified_name)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING symbol_id`,
  );
  const findSymbol = db.prepare(
    `SELECT symbol_id FROM symbols WHERE qualified_name = ? LIMIT 1`,
  );
  const insertEdge = db.prepare(
    `INSERT INTO call_graph (from_symbol_id, to_symbol_id, to_name_unresolved)
     VALUES (?, ?, ?)`,
  );
  const wipeForFile = db.prepare(
    `DELETE FROM symbols WHERE file_id = ?`,
  );

  const pool = new ParserPool();

  try {
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      for (const rel of batch) {
        const storageRel = options.pathPrefix ? `${options.pathPrefix}${rel}` : rel;
        const language = detectLanguage(rel);
        const language_str = language ?? "unknown";
        const ts = nowMs();
        const file = insertFile.get(sessionId, storageRel, language_str, ts) as { file_id: number } | undefined;
        if (!file) continue;
        const fileId = file.file_id;

        if (!language) {
          updateFileStatus.run("SKIPPED", ts, fileId);
          filesSkipped += 1;
          continue;
        }
        const extractor = pickExtractor(language);
        if (!extractor) {
          updateFileStatus.run("SKIPPED", ts, fileId);
          filesSkipped += 1;
          continue;
        }

        const abs = path.join(rootAbs, rel);
        let content = "";
        try {
          const stat = fs.statSync(abs);
          if (stat.size > MAX_FILE_BYTES) {
            updateFileStatus.run("SKIPPED", ts, fileId);
            filesSkipped += 1;
            continue;
          }
          content = fs.readFileSync(abs, "utf8");
        } catch {
          updateFileStatus.run("FAILED", ts, fileId);
          filesFailed += 1;
          continue;
        }

        try {
          const tree = await pool.parse(content, language);
          if (!tree) {
            updateFileStatus.run("FAILED", ts, fileId);
            filesFailed += 1;
            continue;
          }
          const extracted = extractor(tree.rootNode as SyntaxNode, rel);

          const persist = db.transaction(() => {
            wipeForFile.run(fileId);
            const localSymbolIds = new Map<string, number>();
            for (const s of extracted.symbols) {
              const row = insertSymbol.get(
                fileId,
                s.name,
                s.kind,
                s.line_start,
                s.line_end,
                s.qualified_name,
              ) as { symbol_id: number };
              localSymbolIds.set(s.qualified_name, row.symbol_id);
              symbolCount += 1;
            }
            for (const e of extracted.edges) {
              const fromId = localSymbolIds.get(e.from_qname);
              if (!fromId) continue;
              let toId: number | null = null;
              if (e.to_name_resolved) {
                const local = localSymbolIds.get(e.to_name_resolved);
                if (local) {
                  toId = local;
                } else {
                  const row = findSymbol.get(e.to_name_resolved) as { symbol_id: number } | undefined;
                  if (row) toId = row.symbol_id;
                }
              }
              insertEdge.run(fromId, toId, toId ? null : e.to_name_unresolved ?? null);
              edgeCount += 1;
            }
            updateFileStatus.run("ANALYZED", ts, fileId);
          });
          persist();
          filesAnalyzed += 1;
        } catch {
          updateFileStatus.run("FAILED", ts, fileId);
          filesFailed += 1;
        }
      }
    }
  } finally {
    pool.shutdown();
  }

  const finished = nowMs();
  emitEvent(db, sessionId, "repo_analyzed", {
    files_analyzed: filesAnalyzed,
    files_skipped: filesSkipped,
    files_failed: filesFailed,
    symbols: symbolCount,
    edges: edgeCount,
    duration_ms: finished - started,
  });
  emitEvent(db, sessionId, "risk_cache_invalidated", { source: "analyze_repo" });

  return {
    files_analyzed: filesAnalyzed,
    files_skipped: filesSkipped,
    files_failed: filesFailed,
    symbols: symbolCount,
    edges: edgeCount,
    worker_restarts: pool.recycles,
    duration_ms: finished - started,
    languages_supported: supportedLanguages(),
  };
}
