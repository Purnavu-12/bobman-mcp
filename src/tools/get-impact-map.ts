import { BobmanError } from "../lib/errors.js";
import { enforceTokenBudget } from "../lib/token-budget.js";
import { GetImpactMapInputSchema } from "../schemas/tool-inputs.js";
import { getSession } from "../state/session.js";
import type { ToolDeps } from "./deps.js";

interface SymbolRow {
  symbol_id: number;
  qualified_name: string;
  name: string;
  kind: string;
  rel_path: string;
  line_start: number | null;
}

interface NodeInfo {
  symbol_id: number;
  qualified_name: string;
  name: string;
  kind: string;
  rel_path: string;
  line_start: number | null;
}

function resolveTargets(deps: ToolDeps, sessionId: string, target: string): SymbolRow[] {
  const exact = deps.db
    .prepare(
      `SELECT s.symbol_id, s.qualified_name, s.name, s.kind, f.rel_path, s.line_start
         FROM symbols s
         JOIN file_index f ON f.file_id = s.file_id
        WHERE f.session_id = ? AND s.qualified_name = ?
        LIMIT 20`,
    )
    .all(sessionId, target) as SymbolRow[];
  if (exact.length > 0) return exact;

  const byName = deps.db
    .prepare(
      `SELECT s.symbol_id, s.qualified_name, s.name, s.kind, f.rel_path, s.line_start
         FROM symbols s
         JOIN file_index f ON f.file_id = s.file_id
        WHERE f.session_id = ? AND s.name = ?
        LIMIT 20`,
    )
    .all(sessionId, target) as SymbolRow[];
  if (byName.length > 0) return byName;

  const byFile = deps.db
    .prepare(
      `SELECT s.symbol_id, s.qualified_name, s.name, s.kind, f.rel_path, s.line_start
         FROM symbols s
         JOIN file_index f ON f.file_id = s.file_id
        WHERE f.session_id = ? AND f.rel_path = ?
        LIMIT 50`,
    )
    .all(sessionId, target) as SymbolRow[];
  return byFile;
}

function neighbors(
  deps: ToolDeps,
  sessionId: string,
  symbolId: number,
  direction: "callers" | "callees",
): SymbolRow[] {
  if (direction === "callees") {
    return deps.db
      .prepare(
        `SELECT s.symbol_id, s.qualified_name, s.name, s.kind, f.rel_path, s.line_start
           FROM call_graph cg
           JOIN symbols s ON s.symbol_id = cg.to_symbol_id
           JOIN file_index f ON f.file_id = s.file_id
          WHERE cg.from_symbol_id = ? AND f.session_id = ?`,
      )
      .all(symbolId, sessionId) as SymbolRow[];
  }
  return deps.db
    .prepare(
      `SELECT s.symbol_id, s.qualified_name, s.name, s.kind, f.rel_path, s.line_start
         FROM call_graph cg
         JOIN symbols s ON s.symbol_id = cg.from_symbol_id
         JOIN file_index f ON f.file_id = s.file_id
        WHERE cg.to_symbol_id = ? AND f.session_id = ?`,
    )
    .all(symbolId, sessionId) as SymbolRow[];
}

function bfs(
  deps: ToolDeps,
  sessionId: string,
  rootIds: number[],
  direction: "callers" | "callees",
  depth: number,
): { nodes: Map<number, NodeInfo & { depth: number }>; edges: { from: number; to: number }[] } {
  const visited = new Map<number, NodeInfo & { depth: number }>();
  const edges: { from: number; to: number }[] = [];
  const queue: { id: number; depth: number }[] = [];

  for (const rid of rootIds) {
    queue.push({ id: rid, depth: 0 });
  }

  while (queue.length > 0) {
    const { id, depth: d } = queue.shift()!;
    if (d > depth) continue;
    if (!visited.has(id)) {
      const row = deps.db
        .prepare(
          `SELECT s.symbol_id, s.qualified_name, s.name, s.kind, f.rel_path, s.line_start
             FROM symbols s
             JOIN file_index f ON f.file_id = s.file_id
            WHERE s.symbol_id = ?`,
        )
        .get(id) as SymbolRow | undefined;
      if (!row) continue;
      visited.set(id, { ...row, depth: d });
    }
    if (d === depth) continue;
    const nbrs = neighbors(deps, sessionId, id, direction);
    for (const n of nbrs) {
      if (direction === "callees") {
        edges.push({ from: id, to: n.symbol_id });
      } else {
        edges.push({ from: n.symbol_id, to: id });
      }
      if (!visited.has(n.symbol_id)) {
        queue.push({ id: n.symbol_id, depth: d + 1 });
      }
    }
  }
  return { nodes: visited, edges };
}

export function handleGetImpactMap(deps: ToolDeps, raw: unknown) {
  const input = GetImpactMapInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }
  const targets = resolveTargets(deps, session.session_id, input.target);
  if (targets.length === 0) {
    return {
      session_id: session.session_id,
      target: input.target,
      direction: input.direction,
      depth: input.depth,
      resolved_targets: [],
      nodes: [],
      edges: [],
      truncated: false,
      hint: "No symbols matched. Call analyze_repo first, or pass a qualified_name (path::name).",
    };
  }
  const rootIds = targets.map((t) => t.symbol_id);

  const allNodes = new Map<number, NodeInfo & { depth: number }>();
  const allEdges: { from: number; to: number }[] = [];

  const directions: ("callers" | "callees")[] =
    input.direction === "both" ? ["callers", "callees"] : [input.direction];

  for (const dir of directions) {
    const r = bfs(deps, session.session_id, rootIds, dir, input.depth);
    for (const [id, node] of r.nodes) {
      const existing = allNodes.get(id);
      if (!existing || node.depth < existing.depth) {
        allNodes.set(id, node);
      }
    }
    for (const e of r.edges) allEdges.push(e);
  }

  const dedupEdges = Array.from(
    new Map(allEdges.map((e) => [`${e.from}->${e.to}`, e])).values(),
  );

  const nodesArr = Array.from(allNodes.values()).map((n) => ({
    symbol_id: n.symbol_id,
    qualified_name: n.qualified_name,
    name: n.name,
    kind: n.kind,
    rel_path: n.rel_path,
    line_start: n.line_start,
    depth: n.depth,
  }));

  const response = {
    session_id: session.session_id,
    target: input.target,
    direction: input.direction,
    depth: input.depth,
    resolved_targets: targets.map((t) => t.qualified_name),
    nodes: nodesArr,
    edges: dedupEdges,
    truncated: false,
  };
  const enforced = enforceTokenBudget(response);
  if (enforced.truncated) {
    const collapsed = collapseImpactMap(response);
    return enforceTokenBudget(collapsed).value;
  }
  return enforced.value;
}

function collapseImpactMap(map: {
  session_id: string;
  target: string;
  direction: "callers" | "callees" | "both";
  depth: number;
  resolved_targets: string[];
  nodes: { symbol_id: number; depth: number; qualified_name: string; name: string; kind: string; rel_path: string; line_start: number | null }[];
  edges: { from: number; to: number }[];
}) {
  const maxDepth = Math.max(0, ...map.nodes.map((n) => n.depth));
  const kept = map.nodes.filter((n) => n.depth < maxDepth);
  const keptIds = new Set(kept.map((n) => n.symbol_id));
  const droppedCount = map.nodes.length - kept.length;
  const keptEdges = map.edges.filter((e) => keptIds.has(e.from) && keptIds.has(e.to));
  return {
    ...map,
    nodes: kept,
    edges: keptEdges,
    truncated: true,
    dropped_outer_layer: droppedCount,
    note:
      "Outer BFS layer dropped to fit token budget. Re-run with smaller depth or a narrower target.",
  };
}
