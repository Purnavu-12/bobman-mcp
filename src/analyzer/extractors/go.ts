import type { ExtractedFile, ExtractedSymbol, SyntaxNode } from "./common.js";
import { walk } from "./common.js";

const SYMBOL_NODES: Record<string, string> = {
  function_declaration: "function",
  method_declaration: "method",
  type_declaration: "type",
};

function getName(node: SyntaxNode): string | null {
  const direct = node.childForFieldName("name");
  if (direct) return direct.text;
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (!c) continue;
    if (c.type === "type_spec") {
      const spec = c.childForFieldName("name");
      if (spec) return spec.text;
    }
    if (c.type === "identifier" || c.type === "field_identifier") return c.text;
  }
  return null;
}

function getCalleeName(node: SyntaxNode): string | null {
  if (node.type !== "call_expression") return null;
  const fn = node.childForFieldName("function");
  if (!fn) return null;
  if (fn.type === "identifier") return fn.text;
  if (fn.type === "selector_expression") {
    const sel = fn.childForFieldName("field");
    if (sel) return sel.text;
  }
  return null;
}

export function extractGo(rootNode: SyntaxNode, relPath: string): ExtractedFile {
  const symbols: ExtractedSymbol[] = [];
  const ranges: { start: number; end: number; qname: string }[] = [];

  walk(rootNode, (n) => {
    const kind = SYMBOL_NODES[n.type];
    if (!kind) return;
    const name = getName(n);
    if (!name) return;
    const qname = `${relPath}::${name}`;
    symbols.push({
      name,
      kind,
      line_start: n.startPosition.row + 1,
      line_end: n.endPosition.row + 1,
      qualified_name: qname,
    });
    ranges.push({ start: n.startPosition.row, end: n.endPosition.row, qname });
  });

  ranges.sort((a, b) => b.end - b.start - (a.end - a.start));

  const edges: ExtractedFile["edges"] = [];
  walk(rootNode, (n) => {
    const callee = getCalleeName(n);
    if (!callee) return;
    const row = n.startPosition.row;
    const container = ranges.find((r) => row >= r.start && row <= r.end);
    if (!container) return;
    const local = symbols.find((s) => s.name === callee);
    if (local) {
      edges.push({ from_qname: container.qname, to_name_resolved: local.qualified_name });
    } else {
      edges.push({ from_qname: container.qname, to_name_unresolved: callee });
    }
  });

  return { symbols, edges };
}
