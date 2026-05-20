import { BobmanError } from "../lib/errors.js";
import { AddKnowledgeInputSchema } from "../schemas/tool-inputs.js";
import { nowMs } from "../state/db.js";
import { emitEvent, getSession } from "../state/session.js";
import type { ToolDeps } from "./deps.js";

const MAX_PER_SESSION = 1000;

export function handleAddKnowledge(deps: ToolDeps, raw: unknown) {
  const input = AddKnowledgeInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }

  const countRow = deps.db
    .prepare(`SELECT COUNT(*) AS c FROM knowledge_entries WHERE session_id = ?`)
    .get(session.session_id) as { c: number };
  if (countRow.c >= MAX_PER_SESSION) {
    throw new BobmanError("CONFLICT", "Knowledge entry limit reached for this session", {
      reason: "knowledge_limit_reached",
      limit: MAX_PER_SESSION,
    });
  }

  const ts = nowMs();
  const result = deps.db
    .prepare(
      `INSERT INTO knowledge_entries (session_id, kind, title, body, source_ref, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING entry_id`,
    )
    .get(
      session.session_id,
      input.kind,
      input.title,
      input.body,
      input.source_ref ?? null,
      ts,
    ) as { entry_id: number };

  emitEvent(deps.db, session.session_id, "knowledge_added", {
    entry_id: result.entry_id,
    kind: input.kind,
  });

  return {
    entry_id: result.entry_id,
    kind: input.kind,
    created_at: ts,
  };
}
