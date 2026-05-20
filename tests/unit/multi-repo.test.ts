import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BobmanError } from "../../src/lib/errors.js";
import { resolveAgainstRepos, parseLabelledPath } from "../../src/lib/path-resolve.js";
import { close, open, type BobmanDatabase } from "../../src/state/db.js";
import { addSessionRepo, listSessionRepos } from "../../src/state/repos.js";
import { createSession, updateSessionState } from "../../src/state/session.js";
import { handleAddSessionRepo } from "../../src/tools/add-session-repo.js";

function mkrepo(parent: string, name: string, files: Record<string, string> = {}): string {
  const repo = fs.mkdtempSync(path.join(parent, name));
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(repo, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  return repo;
}

describe("multi-repo support", () => {
  let tmp: string;
  let db: BobmanDatabase;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-multi-"));
    db = open(path.join(tmp, "d.db"));
  });

  afterEach(() => {
    close(db);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("backfills the primary repo into session_repos on create_session", () => {
    const repo = mkrepo(tmp, "api-");
    const s = createSession(db, "test", repo);
    const repos = listSessionRepos(db, s.session_id);
    expect(repos).toHaveLength(1);
    expect(repos[0].position).toBe(0);
    expect(repos[0].label).toBe("primary");
    expect(repos[0].abs_path).toBe(path.resolve(repo));
  });

  it("parseLabelledPath splits label::path correctly", () => {
    expect(parseLabelledPath("web::src/App.tsx")).toEqual({ label: "web", rel: "src/App.tsx" });
    expect(parseLabelledPath("README.md")).toEqual({ rel: "README.md" });
  });

  it("resolves bare path against the first repo by position", () => {
    const apiRepo = mkrepo(tmp, "api-", { "README.md": "api" });
    const webRepo = mkrepo(tmp, "web-", { "README.md": "web" });
    const s = createSession(db, "test", apiRepo);
    addSessionRepo(db, s.session_id, webRepo, "web");
    const repos = listSessionRepos(db, s.session_id);
    const r = resolveAgainstRepos(repos, "README.md");
    expect(r.exists).toBe(true);
    expect(r.repo_label).toBe("primary");
  });

  it("resolves label::path against the named repo", () => {
    const apiRepo = mkrepo(tmp, "api-", { "shared.ts": "x" });
    const webRepo = mkrepo(tmp, "web-", { "App.tsx": "y" });
    const s = createSession(db, "test", apiRepo);
    addSessionRepo(db, s.session_id, webRepo, "web");
    const repos = listSessionRepos(db, s.session_id);
    const r = resolveAgainstRepos(repos, "web::App.tsx");
    expect(r.exists).toBe(true);
    expect(r.repo_label).toBe("web");
  });

  it("rejects unknown label::path", () => {
    const apiRepo = mkrepo(tmp, "api-");
    const s = createSession(db, "test", apiRepo);
    const repos = listSessionRepos(db, s.session_id);
    const r = resolveAgainstRepos(repos, "nope::README.md");
    expect(r.exists).toBe(false);
    expect(r.error).toBe("unknown_repo_label");
  });

  it("rejects label collisions", () => {
    const apiRepo = mkrepo(tmp, "api-");
    const webRepo = mkrepo(tmp, "web-");
    const s = createSession(db, "test", apiRepo);
    addSessionRepo(db, s.session_id, webRepo, "web");
    expect(() => addSessionRepo(db, s.session_id, webRepo, "web")).toThrow(BobmanError);
  });

  it("add_session_repo tool rejects mid-sprint", () => {
    const apiRepo = mkrepo(tmp, "api-");
    const webRepo = mkrepo(tmp, "web-");
    const s = createSession(db, "test", apiRepo);
    updateSessionState(db, s.session_id, "PLANNED", "test");
    updateSessionState(db, s.session_id, "IN_PROGRESS", "test");
    expect(() =>
      handleAddSessionRepo(
        { db },
        { session_id: s.session_id, abs_path: webRepo, label: "web" },
      ),
    ).toThrow(/INVALID_TRANSITION|in state IN_PROGRESS/);
  });

  it("add_session_repo tool happy path", () => {
    const apiRepo = mkrepo(tmp, "api-");
    const webRepo = mkrepo(tmp, "web-");
    const s = createSession(db, "test", apiRepo);
    const res = handleAddSessionRepo(
      { db },
      { session_id: s.session_id, abs_path: webRepo, label: "web" },
    ) as { repo: { label: string; position: number }; repos: unknown[] };
    expect(res.repo.label).toBe("web");
    expect(res.repo.position).toBe(1);
    expect(res.repos).toHaveLength(2);
  });

  it("add_session_repo rejects non-directory paths", () => {
    const apiRepo = mkrepo(tmp, "api-");
    const s = createSession(db, "test", apiRepo);
    expect(() =>
      handleAddSessionRepo(
        { db },
        { session_id: s.session_id, abs_path: path.join(tmp, "nope-not-here") },
      ),
    ).toThrow(BobmanError);
  });
});
