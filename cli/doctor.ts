import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type CheckStatus = "PASS" | "FAIL";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  hint?: string;
}

export interface DoctorDeps {
  loadBetterSqlite3?: () => unknown;
  bobmanHome?: string;
  nodeVersion?: string;
  nodeAbi?: string;
}

const MIN_NODE_MAJOR = 20;
const MAX_NODE_MAJOR = 24;

function checkNode(version: string): CheckResult {
  const match = /^v(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) {
    return { name: "Node version", status: "FAIL", hint: `unrecognized version ${version}` };
  }
  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  if (major < MIN_NODE_MAJOR || (major === MIN_NODE_MAJOR && minor < 10)) {
    return {
      name: "Node version",
      status: "FAIL",
      hint: `Node ${version} is below the supported minimum (>=20.10)`,
    };
  }
  if (major > MAX_NODE_MAJOR) {
    return {
      name: "Node version",
      status: "FAIL",
      hint: `Node ${version} is above the tested range (<25). Use Node 20/22/24.`,
    };
  }
  return { name: "Node version", status: "PASS" };
}

function checkBetterSqlite3(load: () => unknown): CheckResult {
  try {
    load();
    return { name: "better-sqlite3 load", status: "PASS" };
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return {
      name: "better-sqlite3 load",
      status: "FAIL",
      hint: `npm rebuild better-sqlite3 (${msg})`,
    };
  }
}

function checkDbDirectoryWritable(home: string): CheckResult {
  try {
    fs.mkdirSync(home, { recursive: true });
    const probe = path.join(home, `.doctor-${Date.now()}-${process.pid}`);
    fs.writeFileSync(probe, "");
    fs.unlinkSync(probe);
    return { name: "DB directory writable", status: "PASS" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name: "DB directory writable",
      status: "FAIL",
      hint: `cannot write to ${home}: ${msg}`,
    };
  }
}

function checkConfigPresent(repoPath: string): CheckResult {
  const configPath = path.join(repoPath, "bobman.config.json");
  if (!fs.existsSync(configPath)) {
    return {
      name: "Project config",
      status: "PASS",
      hint: "no bobman.config.json (using defaults; run `bobman-mcp init` to create one)",
    };
  }
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    JSON.parse(raw);
    return { name: "Project config", status: "PASS" };
  } catch (err) {
    return {
      name: "Project config",
      status: "FAIL",
      hint: `invalid JSON in ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function runChecks(deps: DoctorDeps = {}): CheckResult[] {
  const nodeVersion = deps.nodeVersion ?? process.version;
  const loader =
    deps.loadBetterSqlite3 ??
    (() => {
      const req = createRequire();
      return req("better-sqlite3");
    });
  const home = deps.bobmanHome ?? process.env.BOBMAN_HOME ?? path.join(os.homedir(), ".bobman");
  const repoPath = process.cwd();

  return [
    checkNode(nodeVersion),
    checkBetterSqlite3(loader),
    checkDbDirectoryWritable(home),
    checkConfigPresent(repoPath),
  ];
}

import { createRequire as nodeCreateRequire } from "node:module";

function createRequire(): (id: string) => unknown {
  return nodeCreateRequire(import.meta.url ?? path.join(process.cwd(), "package.json")) as (
    id: string,
  ) => unknown;
}

function pad(input: string, width: number): string {
  if (input.length >= width) return input;
  return input + " ".repeat(width - input.length);
}

export function formatReport(results: CheckResult[]): string {
  const nameWidth = Math.max(...results.map((r) => r.name.length), "Check".length) + 2;
  const statusWidth = 6;
  const lines: string[] = [];
  lines.push(`${pad("Check", nameWidth)}${pad("Status", statusWidth)}Hint`);
  lines.push(`${"-".repeat(nameWidth)}${"-".repeat(statusWidth)}----`);
  for (const r of results) {
    lines.push(`${pad(r.name, nameWidth)}${pad(r.status, statusWidth)}${r.hint ?? ""}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function exitCodeFor(results: CheckResult[]): number {
  return results.some((r) => r.status === "FAIL") ? 1 : 0;
}

export async function runDoctor(deps: DoctorDeps = {}): Promise<number> {
  const node = deps.nodeVersion ?? process.version;
  const abi = deps.nodeAbi ?? process.versions.modules;
  process.stderr.write(`bobman-mcp doctor (Node ${node}, ABI ${abi})\n`);
  const results = runChecks(deps);
  process.stderr.write(formatReport(results));
  return exitCodeFor(results);
}
