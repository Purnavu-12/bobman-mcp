import fs from "node:fs";
import path from "node:path";
import { writeDefaultConfig } from "../src/lib/config.js";
import {
  hostConfigPaths,
  mergeJsonFile,
  snippetForHost,
  type McpHostId,
} from "../src/lib/mcp-snippets.js";

export interface InitOptions {
  cwd?: string;
  snippets?: McpHostId;
  write?: boolean;
}

const VALID_HOSTS = new Set<McpHostId>([
  "cursor",
  "vscode",
  "opencode",
  "kiro",
  "copilot-cli",
  "all",
]);

export function runInit(optsOrCwd: string | InitOptions = {}): void {
  const opts: InitOptions = typeof optsOrCwd === "string" ? { cwd: optsOrCwd } : optsOrCwd;
  const cwd = opts.cwd ?? process.cwd();
  const configPath = writeDefaultConfig(cwd);
  const host = opts.snippets ?? "all";
  const snippets = snippetForHost(VALID_HOSTS.has(host) ? host : "all");
  const paths = hostConfigPaths();

  const out = process.stdout.write.bind(process.stdout);
  out("Add to ~/.cursor/mcp.json:\n");
  out(`${snippets.cursor ?? snippetForHost("cursor").cursor}\n`);
  out("\nClaude Code:\n\n");
  out("claude mcp add bobman npx -y bobman-mcp\n");
  out("\nOther hosts: see docs/mcp-hosts.md\n\n");

  if (host === "all" || host !== "cursor") {
    for (const [id, json] of Object.entries(snippets)) {
      if (id === "cursor") continue;
      const rel = paths[id as keyof typeof paths];
      out(`--- ${id} (${rel}) ---\n${json}\n\n`);
    }
  }

  if (opts.write) {
    writeHostConfigs(cwd, snippets);
  }

  out(`Wrote ${configPath}\n`);
}

function writeHostConfigs(cwd: string, snippets: Record<string, string>): void {
  const writers: Array<{ rel: string; fragment: Record<string, unknown> }> = [];
  if (snippets.vscode) {
    writers.push({
      rel: ".vscode/mcp.json",
      fragment: JSON.parse(snippets.vscode) as Record<string, unknown>,
    });
  }
  if (snippets.opencode) {
    writers.push({
      rel: "opencode.json",
      fragment: JSON.parse(snippets.opencode) as Record<string, unknown>,
    });
  }
  if (snippets.kiro) {
    writers.push({
      rel: ".kiro/settings/mcp.json",
      fragment: JSON.parse(snippets.kiro) as Record<string, unknown>,
    });
  }

  for (const { rel, fragment } of writers) {
    const full = path.join(cwd, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const content = mergeJsonFile(full, fragment);
    fs.writeFileSync(full, content + "\n", "utf8");
    out(`Wrote MCP config: ${rel}\n`);
  }
}

export function parseInitArgs(argv: string[]): InitOptions {
  const opts: InitOptions = {};
  const si = argv.indexOf("--snippets");
  if (si >= 0 && argv[si + 1]) {
    opts.snippets = argv[si + 1] as McpHostId;
  }
  if (argv.includes("--write")) opts.write = true;
  return opts;
}
