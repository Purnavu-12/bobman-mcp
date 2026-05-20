import type { ExtractedFile, ExtractedSymbol, SyntaxNode } from "./common.js";
import { walk } from "./common.js";

const SYMBOL_NODES: Record<string, string> = {
  function_item: "function",
  struct_item: "struct",
  enum_item: "enum",
  trait_item: "trait",
  impl_item: "impl",
};

function getName(node: SyntaxNode): string | null {
  const direct = node.childForFieldName("name");
  if (direct) return direct.text;
  const ty = node.childForFieldName("type");
  if (ty) return ty.text;
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c && (c.type === "identifier" || c.type === "type_identifier")) return c.text;
  }
  return null;
}

function getCalleeName(node: SyntaxNode): string | null {
  if (node.type === "call_expression") {
    const fn = node.childForFieldName("function");
    if (!fn) return null;
    if (fn.type === "identifier") return fn.text;
    if (fn.type === "field_expression") {
      const field = fn.childForFieldName("field");
      if (field) return field.text;
    }
    if (fn.type === "scoped_identifier") {
      const last = fn.childForFieldName("name");
      if (last) return last.text;
    }
  }
  if (node.type === "macro_invocation") {
    const macro = node.childForFieldName("macro");
    if (macro && macro.type === "identifier") return `${macro.text}!`;
  }
  return null;
}

export function extractRust(rootNode: SyntaxNode, relPath: string): ExtractedFile {
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
