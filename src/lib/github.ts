import { Octokit } from "@octokit/rest";
import { BobmanError } from "./errors.js";

export interface PrContext {
  number: number;
  state: string;
  title: string;
  body: string;
  head_sha: string;
  base_sha: string;
  files_changed: { filename: string; status: string; additions: number; deletions: number }[];
  checks: { name: string; status: string; conclusion: string | null }[];
  comments: { author: string; body: string; created_at: string }[];
}

export interface IssueContext {
  number: number;
  state: string;
  title: string;
  body: string;
  labels: string[];
  comments: { author: string; body: string; created_at: string }[];
}

export type GithubClient = Pick<Octokit["rest"], "pulls" | "issues" | "checks">;

export interface GithubClientFactory {
  (token: string): GithubClient;
}

export function defaultGithubClient(token: string): GithubClient {
  return new Octokit({ auth: token }).rest;
}

export function requireToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new BobmanError("INVALID_INPUT", "GITHUB_TOKEN is required for GitHub tools", {
      code: "GITHUB_TOKEN_MISSING",
      hint: "Set GITHUB_TOKEN in the BobMan server environment.",
    });
  }
  return token;
}

interface OctokitErrorLike {
  status?: number;
  response?: { headers?: Record<string, string> };
  message?: string;
}

function mapGithubError(err: unknown, entity: string): BobmanError {
  const o = err as OctokitErrorLike;
  if (o?.status === 404) {
    return new BobmanError("NOT_FOUND", `${entity} not found`, {
      entity,
    });
  }
  if (o?.status === 403) {
    const remainingHeader = o.response?.headers?.["x-ratelimit-remaining"];
    const remaining = remainingHeader ? parseInt(remainingHeader, 10) : null;
    return new BobmanError("CONFLICT", "GitHub API rate limit or permission error", {
      reason: "github_rate_limit_or_forbidden",
      rate_limit_remaining: remaining,
      message: o.message,
    });
  }
  return new BobmanError("INTERNAL", "GitHub API error", {
    reason: "github_api_error",
    message: o?.message ?? String(err),
  });
}

export async function fetchPrContext(
  gh: GithubClient,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PrContext> {
  try {
    const pr = await gh.pulls.get({ owner, repo, pull_number: prNumber });
    const filesRes = await gh.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 50,
    });
    const commentsRes = await gh.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 10,
      sort: "created",
      direction: "desc",
    });
    let checks: { name: string; status: string; conclusion: string | null }[] = [];
    try {
      const checksRes = await gh.checks.listForRef({
        owner,
        repo,
        ref: pr.data.head.sha,
        per_page: 20,
      });
      checks = checksRes.data.check_runs.map((c) => ({
        name: c.name,
        status: c.status,
        conclusion: c.conclusion,
      }));
    } catch {
      // checks are optional
    }
    return {
      number: pr.data.number,
      state: pr.data.state,
      title: pr.data.title,
      body: pr.data.body ?? "",
      head_sha: pr.data.head.sha,
      base_sha: pr.data.base.sha,
      files_changed: filesRes.data.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
      })),
      checks,
      comments: commentsRes.data.map((c) => ({
        author: c.user?.login ?? "unknown",
        body: c.body ?? "",
        created_at: c.created_at,
      })),
    };
  } catch (err) {
    throw mapGithubError(err, "pull_request");
  }
}

export async function fetchIssueContext(
  gh: GithubClient,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<IssueContext> {
  try {
    const issue = await gh.issues.get({ owner, repo, issue_number: issueNumber });
    const commentsRes = await gh.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 10,
      sort: "created",
      direction: "desc",
    });
    return {
      number: issue.data.number,
      state: issue.data.state,
      title: issue.data.title,
      body: issue.data.body ?? "",
      labels: (issue.data.labels as { name?: string }[] | undefined ?? [])
        .map((l) => (typeof l === "string" ? l : (l.name ?? "")))
        .filter((s) => s.length > 0),
      comments: commentsRes.data.map((c) => ({
        author: c.user?.login ?? "unknown",
        body: c.body ?? "",
        created_at: c.created_at,
      })),
    };
  } catch (err) {
    throw mapGithubError(err, "issue");
  }
}
