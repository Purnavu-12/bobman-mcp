export interface SessionRow {
  session_id: string;
  state: string;
  objective: string;
  updated_at: number;
}

export function sessionLabel(s: SessionRow): string {
  const short = s.session_id.slice(0, 8);
  const obj = s.objective.length > 40 ? `${s.objective.slice(0, 40)}…` : s.objective;
  return `${short} · ${s.state} · ${obj}`;
}

export function parseToolJson<T>(result: {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
  structuredContent?: unknown;
}): T {
  if (result.structuredContent !== undefined) {
    return result.structuredContent as T;
  }
  const text = result.content[0]?.text ?? "{}";
  if (result.isError) {
    try {
      const parsed = JSON.parse(text) as { message?: string; code?: string };
      throw new Error(parsed.message ?? parsed.code ?? text);
    } catch (e) {
      if (e instanceof Error && e.message !== text) throw e;
      throw new Error(text);
    }
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid MCP tool response: ${text.slice(0, 120)}`);
  }
}
