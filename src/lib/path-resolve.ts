import fs from "node:fs";
import path from "node:path";

export type FileScopeKind = "file" | "dir" | "missing";

export interface ResolvedPath {
  path: string;
  abs_path: string;
  exists: boolean;
  kind: FileScopeKind;
  error?: string;
}

export function resolvePathAgainstRepo(repoPath: string, candidate: string): ResolvedPath {
  const absRepo = path.resolve(repoPath);
  const absCandidate = path.resolve(absRepo, candidate);

  const rel = path.relative(absRepo, absCandidate);
  const isOutside = rel.startsWith("..") || path.isAbsolute(rel);
  if (isOutside) {
    return {
      path: candidate,
      abs_path: absCandidate,
      exists: false,
      kind: "missing",
      error: "outside_repo",
    };
  }

  try {
    const stat = fs.lstatSync(absCandidate);
    if (stat.isSymbolicLink()) {
      return {
        path: candidate,
        abs_path: absCandidate,
        exists: false,
        kind: "missing",
        error: "symlink",
      };
    }
    if (stat.isFile()) {
      return {
        path: candidate,
        abs_path: absCandidate,
        exists: true,
        kind: "file",
      };
    }
    if (stat.isDirectory()) {
      return {
        path: candidate,
        abs_path: absCandidate,
        exists: true,
        kind: "dir",
      };
    }
    return {
      path: candidate,
      abs_path: absCandidate,
      exists: false,
      kind: "missing",
      error: "unsupported_kind",
    };
  } catch (err) {
    const errno = (err as NodeJS.ErrnoException).code;
    return {
      path: candidate,
      abs_path: absCandidate,
      exists: false,
      kind: "missing",
      error: errno ?? "stat_failed",
    };
  }
}

export function partitionByExistence(
  resolved: ResolvedPath[],
): { existing: string[]; missing: string[] } {
  const existing: string[] = [];
  const missing: string[] = [];
  for (const r of resolved) {
    if (r.exists) existing.push(r.path);
    else missing.push(r.path);
  }
  return { existing, missing };
}
