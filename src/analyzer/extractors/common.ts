export interface ExtractedSymbol {
  name: string;
  kind: string;
  line_start: number;
  line_end: number;
  qualified_name: string;
}

export interface ExtractedEdge {
  from_qname: string;
  to_name_resolved?: string;
  to_name_unresolved?: string;
}

export interface ExtractedFile {
  symbols: ExtractedSymbol[];
  edges: ExtractedEdge[];
}

export interface SyntaxNode {
  type: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  text: string;
  childCount: number;
  namedChildCount: number;
  child: (i: number) => SyntaxNode | null;
  namedChild: (i: number) => SyntaxNode | null;
  childForFieldName: (name: string) => SyntaxNode | null;
  children: SyntaxNode[];
  namedChildren: SyntaxNode[];
}

export function walk(node: SyntaxNode, visit: (n: SyntaxNode) => void): void {
  visit(node);
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c) walk(c, visit);
  }
}
