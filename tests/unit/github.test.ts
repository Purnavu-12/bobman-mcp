import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BobmanError } from "../../src/lib/errors.js";
import { open, close, type BobmanDatabase } from "../../src/state/db.js";
import { createSession } from "../../src/state/session.js";
import {
  handleGetPrContext,
  setGithubClientFactoryForTests as setPrFactory,
} from "../../src/tools/get-pr-context.js";
import {
  handleGetIssueContext,
  setGithubClientFactoryForTests as setIssueFactory,
} from "../../src/tools/get-issue-context.js";
import type { GithubClient } from "../../src/lib/github.js";

function makeMockClient(overrides: Partial<{
  prGet: ReturnType<typeof vi.fn>;
  filesList: ReturnType<typeof vi.fn>;
  checksList: ReturnType<typeof vi.fn>;
  issueGet: ReturnType<typeof vi.fn>;
  commentsList: ReturnType<typeof vi.fn>;
}>): GithubClient {
  return {
    pulls: {
      get: overrides.prGet ??
        vi.fn().mockResolvedValue({
          data: {
            number: 1,
            state: "open",
            title: "PR title",
            body: "PR body",
            head: { sha: "abc123" },
            base: { sha: "def456" },
          },
        }),
      listFiles:
        overrides.filesList ??
        vi.fn().mockResolvedValue({
          data: [{ filename: "a.ts", status: "modified", additions: 1, deletions: 0 }],
        }),
    },
    issues: {
      get:
        overrides.issueGet ??
        vi.fn().mockResolvedValue({
          data: {
            number: 5,
            state: "open",
            title: "Issue title",
            body: "Issue body",
            labels: [{ name: "bug" }],
          },
        }),
      listComments:
        overrides.commentsList ??
        vi.fn().mockResolvedValue({ data: [] }),
    },
    checks: {
      listForRef:
        overrides.checksList ??
        vi.fn().mockResolvedValue({ data: { check_runs: [] } }),
    },
  } as unknown as GithubClient;
}

describe("GitHub integration", () => {
  let dbDir: string;
  let db: BobmanDatabase;

  beforeEach(() => {
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "bobman-gh-"));
    db = open(path.join(dbDir, "d.db"));
  });

  afterEach(() => {
    close(db);
    setPrFactory(null);
    setIssueFactory(null);
    delete process.env.GITHUB_TOKEN;
    fs.rmSync(dbDir, { recursive: true, force: true });
  });

  it("returns GITHUB_TOKEN_MISSING when token is unset", async () => {
    const s = createSession(db, "test", dbDir);
    delete process.env.GITHUB_TOKEN;
    try {
      await handleGetPrContext(
        { db },
        { session_id: s.session_id, owner: "a", repo: "b", pr_number: 1 },
      );
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(BobmanError);
      expect((err as BobmanError).details?.code).toBe("GITHUB_TOKEN_MISSING");
    }
  });

  it("maps PR fields through the mocked client", async () => {
    const s = createSession(db, "test", dbDir);
    process.env.GITHUB_TOKEN = "fake";
    setPrFactory(() => makeMockClient({}));
    const res = (await handleGetPrContext(
      { db },
      { session_id: s.session_id, owner: "a", repo: "b", pr_number: 1 },
    )) as {
      title: string;
      head_sha: string;
      files_changed: { filename: string }[];
    };
    expect(res.title).toBe("PR title");
    expect(res.head_sha).toBe("abc123");
    expect(res.files_changed[0].filename).toBe("a.ts");
  });

  it("404 from GitHub maps to NOT_FOUND", async () => {
    const s = createSession(db, "test", dbDir);
    process.env.GITHUB_TOKEN = "fake";
    setPrFactory(() => {
      const get = vi.fn().mockRejectedValue({ status: 404, message: "Not Found" });
      return {
        pulls: { get, listFiles: vi.fn() },
        issues: { listComments: vi.fn() },
        checks: { listForRef: vi.fn() },
      } as unknown as GithubClient;
    });
    try {
      await handleGetPrContext(
        { db },
        { session_id: s.session_id, owner: "a", repo: "b", pr_number: 1 },
      );
      expect.fail("expected throw");
    } catch (err) {
      expect((err as BobmanError).code).toBe("NOT_FOUND");
    }
  });

  it("issue tool returns labels and title", async () => {
    const s = createSession(db, "test", dbDir);
    process.env.GITHUB_TOKEN = "fake";
    setIssueFactory(() => makeMockClient({}));
    const res = (await handleGetIssueContext(
      { db },
      { session_id: s.session_id, owner: "a", repo: "b", issue_number: 5 },
    )) as { title: string; labels: string[] };
    expect(res.title).toBe("Issue title");
    expect(res.labels).toEqual(["bug"]);
  });
});
