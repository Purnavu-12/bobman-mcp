import path from "node:path";
import { BobmanError } from "../lib/errors.js";
import type { BobmanDatabase } from "./db.js";

export interface SessionRepo {
  repo_id: number;
  session_id: string;
  label: string;
  abs_path: string;
  position: number;
}

interface SessionRepoRow {
  repo_id: number;
  session_id: string;
  label: string;
  abs_path: string;
  position: number;
}

export function listSessionRepos(db: BobmanDatabase, sessionId: string): SessionRepo[] {
  const rows = db
    .prepare(
      `SELECT repo_id, session_id, label, abs_path, position
       FROM session_repos WHERE session_id = ? ORDER BY position ASC`,
    )
    .all(sessionId) as SessionRepoRow[];
  return rows;
}

export function ensurePrimaryRepo(
  db: BobmanDatabase,
  sessionId: string,
  absPath: string,
): SessionRepo {
  const existing = db
    .prepare(
      `SELECT repo_id, session_id, label, abs_path, position
       FROM session_repos WHERE session_id = ? AND position = 0`,
    )
    .get(sessionId) as SessionRepoRow | undefined;
  if (existing) return existing;
  const info = db
    .prepare(
      `INSERT INTO session_repos (session_id, label, abs_path, position)
       VALUES (?, 'primary', ?, 0)`,
    )
    .run(sessionId, path.resolve(absPath));
  return {
    repo_id: Number(info.lastInsertRowid),
    session_id: sessionId,
    label: "primary",
    abs_path: path.resolve(absPath),
    position: 0,
  };
}

export function addSessionRepo(
  db: BobmanDatabase,
  sessionId: string,
  absPath: string,
  label?: string,
): SessionRepo {
  const repos = listSessionRepos(db, sessionId);
  const nextPosition = repos.length === 0 ? 0 : Math.max(...repos.map((r) => r.position)) + 1;
  const resolved = path.resolve(absPath);
  const finalLabel = (label ?? `repo${nextPosition}`).trim();
  if (finalLabel.length === 0 || finalLabel.includes("::")) {
    throw new BobmanError("INVALID_INPUT", "Repo label must be non-empty and cannot contain '::'", {
      label: finalLabel,
    });
  }
  if (repos.some((r) => r.label === finalLabel)) {
    throw new BobmanError("CONFLICT", `Repo label already exists: ${finalLabel}`, {
      reason: "label_collision",
      label: finalLabel,
    });
  }
  const info = db
    .prepare(
      `INSERT INTO session_repos (session_id, label, abs_path, position)
       VALUES (?, ?, ?, ?)`,
    )
    .run(sessionId, finalLabel, resolved, nextPosition);
  return {
    repo_id: Number(info.lastInsertRowid),
    session_id: sessionId,
    label: finalLabel,
    abs_path: resolved,
    position: nextPosition,
  };
}
