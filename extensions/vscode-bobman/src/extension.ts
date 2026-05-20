import * as vscode from "vscode";
import { BobmanMcpService, resolveBobmanRepoPath } from "./mcpService.js";
import {
  EventsProvider,
  HotspotsProvider,
  KnowledgeProvider,
  RisksProvider,
  SessionsProvider,
  TasksProvider,
} from "./providers.js";
import { setActiveSessionId, getActiveSessionId } from "./sessionConfig.js";

let pollTimer: ReturnType<typeof setInterval> | undefined;
let statusItem: vscode.StatusBarItem | undefined;
let service: BobmanMcpService | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const svc = new BobmanMcpService(context.secrets);
  service = svc;
  const sessions = new SessionsProvider(svc);
  const tasks = new TasksProvider(svc);
  const events = new EventsProvider(svc);
  const hotspots = new HotspotsProvider(svc);
  const risks = new RisksProvider(svc);
  const knowledge = new KnowledgeProvider(svc);

  const providers = [sessions, tasks, events, hotspots, risks, knowledge];

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("bobman.sessions", sessions),
    vscode.window.registerTreeDataProvider("bobman.tasks", tasks),
    vscode.window.registerTreeDataProvider("bobman.events", events),
    vscode.window.registerTreeDataProvider("bobman.hotspots", hotspots),
    vscode.window.registerTreeDataProvider("bobman.risks", risks),
    vscode.window.registerTreeDataProvider("bobman.knowledge", knowledge),
  );

  const refreshViews = () => {
    for (const p of providers) p.refresh();
  };

  const pollOnce = async () => {
    try {
      await svc.connect();
      await sessions.getChildren();
      await updateStatusBar(svc);
      refreshViews();
    } catch {
      refreshViews();
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("bobman.refresh", async () => {
      await svc.connect(true);
      await pollOnce();
    }),
    vscode.commands.registerCommand("bobman.setActiveSessionId", async (sessionId?: string) => {
      if (!sessionId || typeof sessionId !== "string") return;
      await setActiveSessionId(sessionId);
      refreshViews();
      await updateStatusBar(svc);
    }),
    vscode.commands.registerCommand("bobman.setActiveSession", async () => {
      await svc.connect();
      const data = await svc.callTool<{ sessions: Array<{ session_id: string; objective: string }> }>(
        "list_sessions",
        { limit: 30 },
      );
      const pick = await vscode.window.showQuickPick(
        data.sessions.map((s) => ({
          label: s.session_id.slice(0, 8),
          description: s.objective,
          sessionId: s.session_id,
        })),
        { placeHolder: "Select BobMan session" },
      );
      if (pick) {
        await setActiveSessionId(pick.sessionId);
        refreshViews();
        await updateStatusBar(svc);
      }
    }),
    vscode.commands.registerCommand("bobman.openSettings", () => {
      void vscode.commands.executeCommand("workbench.action.openSettings", "bobman");
    }),
    vscode.commands.registerCommand("bobman.setHttpToken", async () => {
      const token = await vscode.window.showInputBox({
        prompt: "BobMan HTTP Bearer token",
        password: true,
        ignoreFocusOut: true,
      });
      if (token !== undefined) {
        await context.secrets.store("bobman.token", token);
        vscode.window.showInformationMessage("BobMan HTTP token saved.");
      }
    }),
  );

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusItem.command = "bobman.setActiveSession";
  statusItem.tooltip = "BobMan active session — click to change";
  context.subscriptions.push(statusItem);

  const interval = vscode.workspace.getConfiguration("bobman").get<number>("pollIntervalMs", 5000);
  pollTimer = setInterval(() => void pollOnce(), interval);
  context.subscriptions.push({ dispose: () => clearInterval(pollTimer) });

  void svc.connect().then(() => pollOnce()).catch((err) => {
    const msg = (err as Error).message;
    const repo = resolveBobmanRepoPath();
    statusItem!.text = "$(error) BobMan";
    statusItem!.tooltip = `${msg}\nrepo: ${repo}\nProduction: npx -y bobman-mcp start — see docs/production.md`;
    statusItem!.show();
    void vscode.window.showErrorMessage(
      `BobMan extension: MCP connect failed (${repo}). Run: npx bobman-mcp doctor. Defaults: npx -y bobman-mcp start. ${msg}`,
    );
  });
}

async function updateStatusBar(svc: BobmanMcpService): Promise<void> {
  if (!statusItem) return;
  const sid = await getActiveSessionId();
  const repo = svc.lastRepoPath ?? resolveBobmanRepoPath();
  if (!sid) {
    statusItem.text = "$(symbol-event) BobMan: no session";
    statusItem.tooltip = `repo: ${repo} — create_session via MCP or click to pick`;
    statusItem.show();
    return;
  }
  try {
    const st = await svc.callTool<{ state: string }>("get_session_status", { session_id: sid });
    statusItem.text = `$(symbol-event) BobMan: ${sid.slice(0, 8)} ${st.state}`;
    statusItem.tooltip = `repo: ${repo}\nsession: ${sid}`;
    statusItem.show();
  } catch {
    statusItem.text = `$(symbol-event) BobMan: ${sid.slice(0, 8)}`;
    statusItem.tooltip = `repo: ${repo}`;
    statusItem.show();
  }
}

export function deactivate(): void {
  clearInterval(pollTimer);
  statusItem?.dispose();
  void service?.disconnect();
  service = undefined;
}
