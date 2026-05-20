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

export interface RepoLike {
  label: string;
  abs_path: string;
  position: number;
}

const LABEL_SEP = "::";

export function parseLabelledPath(candidate: string): { label?: string; rel: string } {
  const idx = candidate.indexOf(LABEL_SEP);
  if (idx <= 0) return { rel: candidate };
  return { label: candidate.slice(0, idx), rel: candidate.slice(idx + LABEL_SEP.length) };
}

export function resolveAgainstRepos(
  repos: RepoLike[],
  candidate: string,
): ResolvedPath & { repo_label?: string } {
  if (repos.length === 0) {
    return {
      path: candidate,
      abs_path: candidate,
      exists: false,
      kind: "missing",
      error: "no_repos_configured",
    };
  }
  const parsed = parseLabelledPath(candidate);
  if (parsed.label) {
    const repo = repos.find((r) => r.label === parsed.label);
    if (!repo) {
      return {
        path: candidate,
        abs_path: candidate,
        exists: false,
        kind: "missing",
        error: "unknown_repo_label",
      };
    }
    const r = resolvePathAgainstRepo(repo.abs_path, parsed.rel);
    return { ...r, path: candidate, repo_label: repo.label };
  }
  let firstNonExisting: (ResolvedPath & { repo_label?: string }) | null = null;
  for (const repo of repos) {
    const r = resolvePathAgainstRepo(repo.abs_path, candidate);
    if (r.exists) {
      return { ...r, repo_label: repo.label };
    }
    if (firstNonExisting === null) {
      firstNonExisting = { ...r, repo_label: repo.label };
    }
  }
  return firstNonExisting!;
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
