import * as vscode from "vscode";
import { sessionLabel, type SessionRow } from "./mappers.js";
import type { BobmanMcpService } from "./mcpService.js";
import { ensureActiveSession, getActiveSessionId } from "./sessionConfig.js";

export class BobTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly payload?: string,
  ) {
    super(label, collapsibleState);
  }
}

export class SessionsProvider implements vscode.TreeDataProvider<BobTreeItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly svc: BobmanMcpService) {}

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: BobTreeItem): BobTreeItem {
    return element;
  }

  async getChildren(): Promise<BobTreeItem[]> {
    try {
      const data = await this.svc.callTool<{ sessions: SessionRow[] }>("list_sessions", { limit: 30 });
      await ensureActiveSession(data.sessions);
      return data.sessions.map((s) => {
        const item = new BobTreeItem(
          sessionLabel(s),
          vscode.TreeItemCollapsibleState.None,
          s.session_id,
        );
        item.command = {
          command: "bobman.setActiveSessionId",
          title: "Set active session",
          arguments: [s.session_id],
        };
        return item;
      });
    } catch (e) {
      const repo = this.svc.lastRepoPath ?? "?";
      return [
        new BobTreeItem(`Error: ${(e as Error).message}`, vscode.TreeItemCollapsibleState.None),
        new BobTreeItem(`repo: ${repo}`, vscode.TreeItemCollapsibleState.None),
      ];
    }
  }
}

export class TasksProvider implements vscode.TreeDataProvider<BobTreeItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly svc: BobmanMcpService) {}

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: BobTreeItem): BobTreeItem {
    return element;
  }

  async getChildren(): Promise<BobTreeItem[]> {
    const sid = await getActiveSessionId();
    if (!sid) {
      return [new BobTreeItem("Set active session (bobman.setActiveSession)", vscode.TreeItemCollapsibleState.None)];
    }
    try {
      const st = await this.svc.callTool<{
        state: string;
        current_task?: { task_id: string; instruction: string; status: string };
        pending_count?: number;
      }>("get_session_status", { session_id: sid });
      const items: BobTreeItem[] = [
        new BobTreeItem(`Session state: ${st.state}`, vscode.TreeItemCollapsibleState.None),
      ];
      if (st.current_task) {
        items.push(
          new BobTreeItem(
            `${st.current_task.status}: ${st.current_task.instruction.slice(0, 60)}`,
            vscode.TreeItemCollapsibleState.None,
            st.current_task.task_id,
          ),
        );
      }
      if (st.pending_count != null) {
        items.push(
          new BobTreeItem(`Pending tasks: ${st.pending_count}`, vscode.TreeItemCollapsibleState.None),
        );
      }
      return items;
    } catch (e) {
      return [new BobTreeItem(`Error: ${(e as Error).message}`, vscode.TreeItemCollapsibleState.None)];
    }
  }
}

export class EventsProvider implements vscode.TreeDataProvider<BobTreeItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly svc: BobmanMcpService) {}

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: BobTreeItem): BobTreeItem {
    return element;
  }

  async getChildren(): Promise<BobTreeItem[]> {
    const sid = await getActiveSessionId();
    if (!sid) return [new BobTreeItem("No active session", vscode.TreeItemCollapsibleState.None)];
    try {
      const data = await this.svc.callTool<{ events: Array<{ type: string; ts: number }> }>(
        "query_events",
        { session_id: sid, limit: 25 },
      );
      return data.events.map(
        (ev) =>
          new BobTreeItem(
            `${new Date(ev.ts).toISOString().slice(11, 19)} ${ev.type}`,
            vscode.TreeItemCollapsibleState.None,
          ),
      );
    } catch (e) {
      return [new BobTreeItem(`Error: ${(e as Error).message}`, vscode.TreeItemCollapsibleState.None)];
    }
  }
}

export class HotspotsProvider implements vscode.TreeDataProvider<BobTreeItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly svc: BobmanMcpService) {}

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: BobTreeItem): BobTreeItem {
    return element;
  }

  async getChildren(): Promise<BobTreeItem[]> {
    const sid = await getActiveSessionId();
    if (!sid) return [new BobTreeItem("No active session", vscode.TreeItemCollapsibleState.None)];
    try {
      const data = await this.svc.callTool<{ hotspots: Array<{ path: string; score: number }> }>(
        "get_change_hotspots",
        { session_id: sid, window_days: 90, limit: 15 },
      );
      return (data.hotspots ?? []).map(
        (h) =>
          new BobTreeItem(
            `${h.score.toFixed(1)} ${h.path}`,
            vscode.TreeItemCollapsibleState.None,
          ),
      );
    } catch (e) {
      return [new BobTreeItem(`Error: ${(e as Error).message}`, vscode.TreeItemCollapsibleState.None)];
    }
  }
}

export class RisksProvider implements vscode.TreeDataProvider<BobTreeItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly svc: BobmanMcpService) {}

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: BobTreeItem): BobTreeItem {
    return element;
  }

  async getChildren(): Promise<BobTreeItem[]> {
    const sid = await getActiveSessionId();
    if (!sid) return [new BobTreeItem("No active session", vscode.TreeItemCollapsibleState.None)];
    try {
      const data = await this.svc.callTool<{
        items: Array<{ path: string; risk_score_0_100: number; explanation?: string }>;
      }>("get_top_risks", { session_id: sid, limit: 15 });
      return (data.items ?? []).map(
        (r) =>
          new BobTreeItem(
            `${r.risk_score_0_100} ${r.path}`,
            vscode.TreeItemCollapsibleState.None,
            r.explanation,
          ),
      );
    } catch (e) {
      return [new BobTreeItem(`Error: ${(e as Error).message}`, vscode.TreeItemCollapsibleState.None)];
    }
  }
}

export class KnowledgeProvider implements vscode.TreeDataProvider<BobTreeItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly svc: BobmanMcpService) {}

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: BobTreeItem): BobTreeItem {
    return element;
  }

  async getChildren(): Promise<BobTreeItem[]> {
    const sid = await getActiveSessionId();
    if (!sid) return [new BobTreeItem("No active session", vscode.TreeItemCollapsibleState.None)];
    try {
      const data = await this.svc.callTool<{
        entries: Array<{ title: string; kind: string }>;
      }>("query_knowledge", { session_id: sid, q: "session", limit: 20 });
      return (data.entries ?? []).map(
        (e) =>
          new BobTreeItem(
            `[${e.kind}] ${e.title}`,
            vscode.TreeItemCollapsibleState.None,
          ),
      );
    } catch (e) {
      return [new BobTreeItem(`Error: ${(e as Error).message}`, vscode.TreeItemCollapsibleState.None)];
    }
  }
}
