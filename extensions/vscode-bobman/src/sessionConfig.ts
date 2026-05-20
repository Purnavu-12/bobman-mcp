import * as vscode from "vscode";

export async function getActiveSessionId(): Promise<string | undefined> {
  const id = vscode.workspace.getConfiguration("bobman").get<string>("activeSessionId", "").trim();
  return id || undefined;
}

export async function setActiveSessionId(sessionId: string): Promise<void> {
  await vscode.workspace
    .getConfiguration("bobman")
    .update("activeSessionId", sessionId, vscode.ConfigurationTarget.Workspace);
}

/** Pick newest session when none is active (e.g. after Copilot create_session). */
export async function ensureActiveSession(
  sessions: Array<{ session_id: string }>,
): Promise<string | undefined> {
  if (sessions.length === 0) return undefined;
  const current = await getActiveSessionId();
  if (current && sessions.some((s) => s.session_id === current)) return current;
  const newest = sessions[0]!.session_id;
  await setActiveSessionId(newest);
  return newest;
}
