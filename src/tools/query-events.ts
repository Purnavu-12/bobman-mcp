import { BobmanError } from "../lib/errors.js";
import { sanitize } from "../lib/sanitize.js";
import { enforceTokenBudget } from "../lib/token-budget.js";
import { QueryEventsInputSchema } from "../schemas/tool-inputs.js";
import { getSession } from "../state/session.js";
import type { ToolDeps } from "./deps.js";

interface EventRow {
  event_id: number;
  type: string;
  created_at: number;
  details_json: string;
}

interface ReturnedEvent {
  event_id: number;
  type: string;
  created_at: number;
  details: Record<string, unknown>;
}

const DEFAULT_MAX_TOKENS = 2000;

function estimateTokens(json: string): number {
  return Math.ceil(Buffer.byteLength(json, "utf8") / 4);
}

export function handleQueryEvents(deps: ToolDeps, raw: unknown) {
  const input = QueryEventsInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }

  const clauses: string[] = ["session_id = ?"];
  const params: unknown[] = [session.session_id];

  if (input.types && input.types.length > 0) {
    const placeholders = input.types.map(() => "?").join(", ");
    clauses.push(`type IN (${placeholders})`);
    params.push(...input.types);
  }
  if (typeof input.since === "number") {
    clauses.push("created_at >= ?");
    params.push(input.since);
  }

  const limit = input.limit ?? 100;
  const sql = `SELECT event_id, type, created_at, details_json
               FROM events
               WHERE ${clauses.join(" AND ")}
               ORDER BY created_at ASC, event_id ASC
               LIMIT ?`;
  const rows = deps.db.prepare(sql).all(...params, limit) as EventRow[];

  const events: ReturnedEvent[] = rows.map((r) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(r.details_json);
    } catch {
      parsed = { raw: r.details_json };
    }
    const sanitized = (
      parsed && typeof parsed === "object" ? sanitize(parsed) : { value: parsed }
    ) as Record<string, unknown>;
    return {
      event_id: r.event_id,
      type: r.type,
      created_at: r.created_at,
      details: sanitized,
    };
  });

  let dropped = 0;
  const baseEnvelope = (list: ReturnedEvent[]): Record<string, unknown> => ({
    session_id: session.session_id,
    events: list,
  });

  while (events.length > 0 && estimateTokens(JSON.stringify(baseEnvelope(events))) > DEFAULT_MAX_TOKENS) {
    events.shift();
    dropped++;
  }

  const response: Record<string, unknown> = {
    session_id: session.session_id,
    events,
  };
  if (dropped > 0) {
    response.truncated = { dropped, reason: "token_budget" };
  }

  return enforceTokenBudget(response, DEFAULT_MAX_TOKENS).value;
}
