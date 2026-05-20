import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const gitOk = () => "git version 2.45.0\n";
import {
  exitCodeFor,
  formatReport,
  runChecks,
  runDoctor,
  type CheckResult,
} from "../../cli/doctor.js";

function makeHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bobman-doctor-"));
}

describe("doctor", () => {
  it("returns all PASS when environment is healthy", () => {
    const home = makeHome();
    const results = runChecks({
      loadBetterSqlite3: () => ({ ok: true }),
      bobmanHome: home,
      nodeVersion: "v22.22.0",
      nodeAbi: "127",
      gitVersion: gitOk,
    });
    expect(results.every((r) => r.status === "PASS")).toBe(true);
    expect(exitCodeFor(results)).toBe(0);
  });

  it("FAILs when git binary is missing", () => {
    const home = makeHome();
    const results = runChecks({
      loadBetterSqlite3: () => ({}),
      bobmanHome: home,
      nodeVersion: "v22.22.0",
      gitVersion: () => {
        throw new Error("ENOENT git");
      },
    });
    const git = results.find((r) => r.name === "git binary")!;
    expect(git.status).toBe("FAIL");
    expect(git.hint).toContain("git not on PATH");
  });

  it("FAILs better-sqlite3 load when require throws", () => {
    const home = makeHome();
    const results = runChecks({
      loadBetterSqlite3: () => {
        throw new Error("NODE_MODULE_VERSION 127 vs 137");
      },
      bobmanHome: home,
      nodeVersion: "v24.0.0",
      nodeAbi: "137",
      gitVersion: gitOk,
    });
    const native = results.find((r) => r.name === "better-sqlite3 load")!;
    expect(native.status).toBe("FAIL");
    expect(native.hint).toContain("npm rebuild better-sqlite3");
    expect(exitCodeFor(results)).toBe(1);
  });

  it("FAILs Node version outside the supported range", () => {
    const home = makeHome();
    const tooOld = runChecks({
      loadBetterSqlite3: () => ({}),
      bobmanHome: home,
      nodeVersion: "v18.20.0",
      gitVersion: gitOk,
    });
    expect(tooOld.find((r) => r.name === "Node version")!.status).toBe("FAIL");

    const tooNew = runChecks({
      loadBetterSqlite3: () => ({}),
      bobmanHome: home,
      nodeVersion: "v25.0.0",
      gitVersion: gitOk,
    });
    expect(tooNew.find((r) => r.name === "Node version")!.status).toBe("FAIL");
  });

  it("FAILs DB directory when it is not writable", () => {
    const home = path.join(makeHome(), "child");
    // Make parent read-only by writing a file where the directory would go
    fs.writeFileSync(home, "occupied");
    const results = runChecks({
      loadBetterSqlite3: () => ({}),
      bobmanHome: home,
      nodeVersion: "v22.22.0",
      gitVersion: gitOk,
    });
    expect(results.find((r) => r.name === "DB directory writable")!.status).toBe("FAIL");
  });

  it("formatReport produces a Check/Status header and rows", () => {
    const sample: CheckResult[] = [
      { name: "A", status: "PASS" },
      { name: "B", status: "FAIL", hint: "fix it" },
    ];
    const out = formatReport(sample);
    expect(out).toContain("Check");
    expect(out).toContain("Status");
    expect(out).toContain("A");
    expect(out).toContain("B");
    expect(out).toContain("fix it");
  });

  it("runDoctor exits 0 when all checks pass", async () => {
    const home = makeHome();
    const code = await runDoctor({
      loadBetterSqlite3: () => ({}),
      bobmanHome: home,
      nodeVersion: "v22.22.0",
      nodeAbi: "127",
      gitVersion: gitOk,
    });
    expect(code).toBe(0);
  });
});
