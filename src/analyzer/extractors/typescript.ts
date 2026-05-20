import type { ExtractedFile, ExtractedSymbol, SyntaxNode } from "./common.js";
import { walk } from "./common.js";

const SYMBOL_NODES: Record<string, string> = {
  function_declaration: "function",
  method_definition: "method",
  class_declaration: "class",
  interface_declaration: "interface",
  type_alias_declaration: "type",
  enum_declaration: "enum",
};

function getIdentifier(node: SyntaxNode): string | null {
  const direct = node.childForFieldName("name");
  if (direct) return direct.text;
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c && (c.type === "identifier" || c.type === "type_identifier")) {
      return c.text;
    }
  }
  return null;
}

function getCalleeName(node: SyntaxNode): string | null {
  if (node.type !== "call_expression") return null;
  const callee = node.childForFieldName("function");
  if (!callee) return null;
  if (callee.type === "identifier") return callee.text;
  if (callee.type === "member_expression") {
    const prop = callee.childForFieldName("property");
    if (prop) return prop.text;
  }
  return null;
}

export function extractTypescript(rootNode: SyntaxNode, relPath: string): ExtractedFile {
  const symbols: ExtractedSymbol[] = [];
  const ranges: { start: number; end: number; qname: string }[] = [];

  walk(rootNode, (n) => {
    const kind = SYMBOL_NODES[n.type];
    if (!kind) return;
    const name = getIdentifier(n);
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
    const callerRow = n.startPosition.row;
    const container = ranges.find((r) => callerRow >= r.start && callerRow <= r.end);
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
