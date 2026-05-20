import path from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import type { BobmanDatabase } from "../state/db.js";
import { nowMs } from "../state/db.js";
import { emitEvent } from "../state/session.js";

export interface GitIndexOptions {
  windowDays?: number;
  cacheBlame?: boolean;
  blamePaths?: string[];
}

export interface GitIndexResult {
  window_days: number;
  commits_added: number;
  files_touched: number;
  conflicts_marked: number;
  blame_files_indexed: number;
  started_at: number;
  finished_at: number;
}

const DEFAULT_WINDOW_DAYS = 90;
const CONFLICT_MARKERS = /^<<<<<<<|^=======|^>>>>>>>/m;

function clampWindow(windowDays?: number): number {
  if (typeof windowDays !== "number" || !Number.isFinite(windowDays)) {
    return DEFAULT_WINDOW_DAYS;
  }
  if (windowDays < 1) return 1;
  if (windowDays > 730) return 730;
  return Math.floor(windowDays);
}

function maxCommittedAt(db: BobmanDatabase, sessionId: string): number {
  const row = db
    .prepare(`SELECT MAX(committed_at) AS m FROM commits WHERE session_id = ?`)
    .get(sessionId) as { m: number | null };
  return row.m ?? 0;
}

async function detectConflictMarkers(
  git: SimpleGit,
  sha: string,
  parents: number,
): Promise<boolean> {
  if (parents <= 1) return false;
  try {
    const diff = await git.raw([
      "show",
      "--no-color",
      "--no-textconv",
      "--diff-filter=AM",
      "--format=",
      sha,
    ]);
    return CONFLICT_MARKERS.test(diff);
  } catch {
    return false;
  }
}

export async function gitIndex(
  db: BobmanDatabase,
  sessionId: string,
  repoPath: string,
  options: GitIndexOptions = {},
): Promise<GitIndexResult> {
  const started = nowMs();
  const windowDays = clampWindow(options.windowDays);
  const sinceMs = started - windowDays * 24 * 60 * 60 * 1000;
  const previousMax = maxCommittedAt(db, sessionId);
  const sinceForGit = Math.max(sinceMs, previousMax + 1);

  const git = simpleGit({ baseDir: path.resolve(repoPath) });

  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) {
    return {
      window_days: windowDays,
      commits_added: 0,
      files_touched: 0,
      conflicts_marked: 0,
      blame_files_indexed: 0,
      started_at: started,
      finished_at: nowMs(),
    };
  }

  const log = await git.log({
    "--since": new Date(sinceForGit).toISOString(),
  });

  let commitsAdded = 0;
  let filesTouched = 0;
  let conflictsMarked = 0;

  const insertCommit = db.prepare(
    `INSERT OR IGNORE INTO commits
       (commit_sha, session_id, author_email, author_name, committed_at,
        message_subject, files_changed, insertions, deletions, parents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertFch = db.prepare(
    `INSERT INTO file_change_history
       (session_id, commit_sha, rel_path, insertions, deletions, was_conflict)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  for (const c of log.all) {
    const sha = c.hash;
    const committedAt = new Date(c.date).getTime();
    if (committedAt <= previousMax) continue;

    let parents = 1;
    let stat: { files: { file: string; insertions: number; deletions: number }[] } = {
      files: [],
    };
    try {
      const parentLine = await git.raw(["log", "-1", "--format=%P", sha]);
      parents = parentLine.trim().split(/\s+/).filter(Boolean).length || 1;
      const numstat = await git.raw([
        "show",
        "--no-color",
        "--no-textconv",
        "--format=",
        "--numstat",
        sha,
      ]);
      const files: { file: string; insertions: number; deletions: number }[] = [];
      for (const line of numstat.split(/\r?\n/)) {
        const parts = line.trim().split(/\t/);
        if (parts.length < 3) continue;
        const ins = parseInt(parts[0], 10);
        const del = parseInt(parts[1], 10);
        if (Number.isNaN(ins) || Number.isNaN(del)) continue;
        files.push({ file: parts[2], insertions: ins, deletions: del });
      }
      stat = { files };
    } catch {
      stat = { files: [] };
    }

    const hasConflictMarkers = await detectConflictMarkers(git, sha, parents);

    const insertions = stat.files.reduce((s, f) => s + f.insertions, 0);
    const deletions = stat.files.reduce((s, f) => s + f.deletions, 0);

    insertCommit.run(
      sha,
      sessionId,
      c.author_email,
      c.author_name,
      committedAt,
      c.message.split(/\r?\n/)[0].slice(0, 256),
      stat.files.length,
      insertions,
      deletions,
      parents,
    );

    for (const f of stat.files) {
      const wasConflict = hasConflictMarkers ? 1 : 0;
      insertFch.run(
        sessionId,
        sha,
        f.file,
        f.insertions,
        f.deletions,
        wasConflict,
      );
      filesTouched += 1;
      if (wasConflict) conflictsMarked += 1;
    }

    commitsAdded += 1;
  }

  let blameFilesIndexed = 0;
  if (options.cacheBlame && options.blamePaths && options.blamePaths.length > 0) {
    const insertBlame = db.prepare(
      `INSERT OR REPLACE INTO blame_cache
         (session_id, rel_path, line_no, author_email, committed_at, commit_sha)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const relPath of options.blamePaths) {
      try {
        const out = await git.raw(["blame", "--line-porcelain", relPath]);
        let currentSha: string | null = null;
        let currentEmail: string | null = null;
        let currentTime: number | null = null;
        let lineNo = 0;
        for (const line of out.split(/\r?\n/)) {
          const headerMatch = /^([0-9a-f]{40}) (\d+) (\d+)(?: \d+)?$/.exec(line);
          if (headerMatch) {
            currentSha = headerMatch[1];
            lineNo = parseInt(headerMatch[3], 10);
            continue;
          }
          if (line.startsWith("author-mail ")) {
            currentEmail = line.slice("author-mail ".length).replace(/^<|>$/g, "");
          } else if (line.startsWith("author-time ")) {
            currentTime = parseInt(line.slice("author-time ".length), 10) * 1000;
          } else if (line.startsWith("\t") && currentSha) {
            insertBlame.run(
              sessionId,
              relPath,
              lineNo,
              currentEmail,
              currentTime,
              currentSha,
            );
          }
        }
        blameFilesIndexed += 1;
      } catch {
        // ignore blame errors per file
      }
    }
  }

  const finished = nowMs();
  emitEvent(db, sessionId, "git_indexed", {
    window_days: windowDays,
    commits_added: commitsAdded,
    files_touched: filesTouched,
    started_at: started,
    finished_at: finished,
  });

  return {
    window_days: windowDays,
    commits_added: commitsAdded,
    files_touched: filesTouched,
    conflicts_marked: conflictsMarked,
    blame_files_indexed: blameFilesIndexed,
    started_at: started,
    finished_at: finished,
  };
}
