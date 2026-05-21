import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  gitVersion?: () => string;
  checkBobmanCli?: () => CheckResult;
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
    const Sqlite = load() as new (path: string) => { close: () => void };
    const db = new Sqlite(":memory:");
    db.close();
    return { name: "better-sqlite3 load", status: "PASS" };
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    const abiHint = /NODE_MODULE_VERSION/.test(String(err))
      ? " Use Node 20/22 LTS, or run: npm rebuild better-sqlite3 (see docs/install-windows.md)."
      : "";
    return {
      name: "better-sqlite3 load",
      status: "FAIL",
      hint: `npm rebuild better-sqlite3 (${msg}).${abiHint}`,
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

function checkGitBinary(probe: () => string): CheckResult {
  try {
    const out = probe();
    const match = /git version ([\d.]+)/.exec(out);
    return {
      name: "git binary",
      status: "PASS",
      hint: match ? `version ${match[1]}` : out.trim().slice(0, 80),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return {
      name: "git binary",
      status: "FAIL",
      hint: `git not on PATH (${msg}). get_change_hotspots and risk scoring need a local git.`,
    };
  }
}

function packageRootFromCliModule(): string {
  const dir =
    typeof __dirname !== "undefined"
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(dir, "../..");
}

function checkBobmanCliResolvable(): CheckResult {
  try {
    const invoked = process.argv[1];
    if (invoked && fs.existsSync(invoked)) {
      const out = execFileSync(process.execPath, [invoked, "--version"], {
        encoding: "utf8",
        timeout: 15_000,
      }).trim();
      return { name: "bobman-mcp CLI", status: "PASS", hint: out.slice(0, 40) };
    }
    const localPkgPath = path.join(process.cwd(), "package.json");
    if (fs.existsSync(localPkgPath)) {
      const localPkg = JSON.parse(fs.readFileSync(localPkgPath, "utf8")) as {
        name?: string;
        bin?: Record<string, string>;
      };
      if (localPkg.name === "bobman-mcp" && localPkg.bin?.["bobman-mcp"]) {
        const binPath = path.join(process.cwd(), localPkg.bin["bobman-mcp"]);
        const out = execFileSync(process.execPath, [binPath, "--version"], {
          encoding: "utf8",
          timeout: 15_000,
        }).trim();
        return { name: "bobman-mcp CLI", status: "PASS", hint: `local dev ${out}` };
      }
    }
    const req = createRequire();
    const pkgPath = req.resolve("bobman-mcp/package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { bin?: Record<string, string> };
    const binRel = pkg.bin?.["bobman-mcp"];
    if (!binRel) {
      return { name: "bobman-mcp CLI", status: "FAIL", hint: "package bin entry missing" };
    }
    const binPath = path.join(path.dirname(pkgPath), binRel);
    const out = execFileSync(process.execPath, [binPath, "--version"], {
      encoding: "utf8",
      timeout: 15_000,
    }).trim();
    return { name: "bobman-mcp CLI", status: "PASS", hint: out.slice(0, 40) };
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return {
      name: "bobman-mcp CLI",
      status: "FAIL",
      hint: `cannot run bobman-mcp --version (${msg}). Use: npx -y bobman-mcp`,
    };
  }
}

function checkNpmGlobalLink(): CheckResult {
  try {
    const out = execFileSync("npm", ["ls", "-g", "bobman-mcp", "--depth=0"], {
      encoding: "utf8",
      timeout: 10_000,
    });
    if (/bobman-mcp@.*->\s*(\.|\/|[A-Za-z]:)/.test(out.replace(/\r?\n/g, " "))) {
      return {
        name: "npm global link",
        status: "FAIL",
        hint: "run: npm unlink -g bobman-mcp (linked clone breaks npx/MCP native modules)",
      };
    }
    return { name: "npm global link", status: "PASS", hint: "not linked to a local clone" };
  } catch {
    return {
      name: "npm global link",
      status: "PASS",
      hint: "bobman-mcp not installed globally",
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

  const gitProbe =
    deps.gitVersion ??
    (() => execFileSync("git", ["--version"], { encoding: "utf8", timeout: 2000 }));

  return [
    checkNode(nodeVersion),
    checkBetterSqlite3(loader),
    checkDbDirectoryWritable(home),
    checkGitBinary(gitProbe),
    deps.checkBobmanCli?.() ?? checkBobmanCliResolvable(),
    checkNpmGlobalLink(),
    checkConfigPresent(repoPath),
  ];
}

import { createRequire as nodeCreateRequire } from "node:module";

function createRequire(): (id: string) => unknown {
  const pkgJson = path.join(packageRootFromCliModule(), "package.json");
  return nodeCreateRequire(pkgJson) as (id: string) => unknown;
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
