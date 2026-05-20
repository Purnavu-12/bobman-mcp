import fs from "node:fs";
import path from "node:path";
import { BobmanError } from "../lib/errors.js";
import { parseLabelledPath } from "../lib/path-resolve.js";
import { analyzeRepo } from "../analyzer/manager.js";
import { AnalyzeRepoInputSchema } from "../schemas/tool-inputs.js";
import {
  ingestCoverageForSession,
  invalidateCoverageSnapshot,
} from "../lib/coverage.js";
import { listSessionRepos } from "../state/repos.js";
import { getSession, updateSessionState } from "../state/session.js";
import type { ToolDeps } from "./deps.js";
import type { AnalyzeRepoSummary } from "../analyzer/manager.js";

export async function handleAnalyzeRepo(deps: ToolDeps, raw: unknown) {
  const input = AnalyzeRepoInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }
  const allowedSources = ["INIT", "PLANNED"] as const;
  if (!allowedSources.includes(session.state as (typeof allowedSources)[number])) {
    throw new BobmanError(
      "INVALID_TRANSITION",
      `Cannot analyze_repo from ${session.state}`,
      { current_state: session.state, attempted_action: "analyze_repo" },
    );
  }
  const original = session.state;

  updateSessionState(
    deps.db,
    session.session_id,
    "ANALYZING",
    "analyze_repo",
    "session_analyzing",
    { from: original },
  );

  let summary: AnalyzeRepoSummary;
  try {
    summary = await analyzeSessionRepos(deps, session.session_id, input.paths, input.force);
  } catch (err) {
    updateSessionState(
      deps.db,
      session.session_id,
      "BLOCKED",
      "analyze_repo",
      "session_blocked",
      { reason: "analyzer_failed", error: String(err) },
    );
    throw err;
  }

  updateSessionState(
    deps.db,
    session.session_id,
    original,
    "analyze_repo",
    "session_analyzed",
    { restored_to: original },
  );

  invalidateCoverageSnapshot(deps.db, session.session_id);
  const repos = listSessionRepos(deps.db, session.session_id);
  const coverageIngested = ingestCoverageForSession(
    deps.db,
    session.session_id,
    repos,
    deps.coveragePaths ?? [],
  );

  return {
    session_id: session.session_id,
    state: original,
    coverage_files_ingested: coverageIngested,
    ...summary,
  };
}

function mergeSummaries(parts: AnalyzeRepoSummary[]): AnalyzeRepoSummary {
  if (parts.length === 0) {
    return {
      files_analyzed: 0,
      files_skipped: 0,
      files_failed: 0,
      symbols: 0,
      edges: 0,
      worker_restarts: 0,
      duration_ms: 0,
      languages_supported: [],
    };
  }
  const langs = new Set<string>();
  for (const p of parts) {
    for (const l of p.languages_supported) langs.add(l);
  }
  return {
    files_analyzed: parts.reduce((a, p) => a + p.files_analyzed, 0),
    files_skipped: parts.reduce((a, p) => a + p.files_skipped, 0),
    files_failed: parts.reduce((a, p) => a + p.files_failed, 0),
    symbols: parts.reduce((a, p) => a + p.symbols, 0),
    edges: parts.reduce((a, p) => a + p.edges, 0),
    worker_restarts: parts.reduce((a, p) => a + p.worker_restarts, 0),
    duration_ms: parts.reduce((a, p) => a + p.duration_ms, 0),
    languages_supported: [...langs] as AnalyzeRepoSummary["languages_supported"],
  };
}

async function analyzeSessionRepos(
  deps: ToolDeps,
  sessionId: string,
  paths: string[] | undefined,
  force?: boolean,
): Promise<AnalyzeRepoSummary> {
  const db = deps.db;
  const repos = listSessionRepos(db, sessionId);
  if (repos.length === 0) {
    throw new BobmanError("INVALID_INPUT", "Session has no repos configured", {
      reason: "no_repos_configured",
      session_id: sessionId,
    });
  }

  if (!paths || paths.length === 0) {
    const parts: AnalyzeRepoSummary[] = [];
    for (const repo of repos) {
      const prefix = repos.length > 1 ? `${repo.label}::` : undefined;
      parts.push(
        await analyzeRepo(db, sessionId, repo.abs_path, {
          force,
          pathPrefix: prefix,
          maxFiles: deps.analyzeMaxFiles,
        }),
      );
    }
    return mergeSummaries(parts);
  }

  const byRepo = new Map<number, { repo: (typeof repos)[0]; relPaths: string[] }>();
  for (const p of paths) {
    const parsed = parseLabelledPath(p);
    if (parsed.label) {
      const repo = repos.find((r) => r.label === parsed.label);
      if (!repo) {
        throw new BobmanError("NOT_FOUND", `Unknown repo label: ${parsed.label}`, {
          entity: "repo_label",
          label: parsed.label,
        });
      }
      const entry = byRepo.get(repo.repo_id) ?? { repo, relPaths: [] };
      entry.relPaths.push(parsed.rel);
      byRepo.set(repo.repo_id, entry);
      continue;
    }
    const matches = repos.filter((r) => {
      try {
        const abs = path.join(r.abs_path, parsed.rel);
        return fs.existsSync(abs);
      } catch {
        return false;
      }
    });
    if (matches.length > 1) {
      throw new BobmanError("CONFLICT", "Path exists in multiple repos; use label::path", {
        reason: "ambiguous_path",
        path: p,
        matching_repos: matches.map((m) => m.label),
      });
    }
    const repo = matches[0] ?? repos[0];
    const entry = byRepo.get(repo.repo_id) ?? { repo, relPaths: [] };
    entry.relPaths.push(parsed.rel);
    byRepo.set(repo.repo_id, entry);
  }

  const parts: AnalyzeRepoSummary[] = [];
  for (const { repo, relPaths } of byRepo.values()) {
    const prefix = repos.length > 1 ? `${repo.label}::` : undefined;
    parts.push(
      await analyzeRepo(db, sessionId, repo.abs_path, {
        paths: relPaths,
        force,
        pathPrefix: prefix,
        maxFiles: deps.analyzeMaxFiles,
      }),
    );
  }
  return mergeSummaries(parts);
}
