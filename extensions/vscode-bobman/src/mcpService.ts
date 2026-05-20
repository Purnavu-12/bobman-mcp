import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { parseToolJson } from "./mappers.js";

export function resolveBobmanRepoPath(): string {
  const cfg = vscode.workspace.getConfiguration("bobman");
  const explicit = cfg.get<string>("repoPath", "").trim();
  if (explicit) return path.resolve(explicit);

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const configPath = path.join(folder.uri.fsPath, "bobman.config.json");
    if (fs.existsSync(configPath)) return folder.uri.fsPath;
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
}

function buildStdioArgs(repoPath: string, baseArgs: string[]): string[] {
  const args = [...baseArgs];
  if (!args.includes("--repo-path")) {
    args.push("--repo-path", repoPath);
  }
  return args;
}

export class BobmanMcpService {
  private client: Client | null = null;
  private transport: StdioClientTransport | StreamableHTTPClientTransport | null = null;
  private connectPromise: Promise<void> | null = null;
  lastRepoPath: string | null = null;

  constructor(private readonly secrets: vscode.SecretStorage) {}

  async connect(force = false): Promise<void> {
    if (!force && this.client) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.doConnect(force).finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private async doConnect(force: boolean): Promise<void> {
    if (force) await this.disconnect();
    else if (this.client) return;

    const cfg = vscode.workspace.getConfiguration("bobman");
    const mode = cfg.get<string>("transport", "stdio");

    if (mode === "http") {
      const url = cfg.get<string>("httpUrl", "http://127.0.0.1:7711/mcp");
      const token = await this.getToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      this.transport = new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers },
      });
      this.lastRepoPath = resolveBobmanRepoPath();
    } else {
      const repoPath = resolveBobmanRepoPath();
      this.lastRepoPath = repoPath;
      const command = cfg.get<string>("command", "npx");
      const baseArgs = cfg.get<string[]>("commandArgs", ["-y", "bobman-mcp", "start"]);
      const args = buildStdioArgs(repoPath, baseArgs);
      this.transport = new StdioClientTransport({
        command,
        args,
        cwd: repoPath,
      });
    }

    this.client = new Client({ name: "vscode-bobman", version: "0.1.0" });
    await this.client.connect(this.transport);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // ignore
      }
    }
    this.client = null;
    this.transport = null;
  }

  private async getToken(): Promise<string | undefined> {
    return (await this.secrets.get("bobman.token")) ?? undefined;
  }

  async callTool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    await this.connect();
    const result = await this.client!.callTool({ name, arguments: args });
    return parseToolJson<T>(result as { content: Array<{ type: string; text?: string }>; isError?: boolean });
  }
}
