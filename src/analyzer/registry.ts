import fs from "node:fs";
import path from "node:path";
import { createRequire as nodeCreateRequire } from "node:module";

export type Language =
  | "typescript"
  | "tsx"
  | "python"
  | "go"
  | "java"
  | "rust";

export interface GrammarSpec {
  language: Language;
  extensions: string[];
  wasm: string;
}

function resolveWasmsDir(): string {
  try {
    const req = nodeCreateRequire(import.meta.url);
    const pkgPath = req.resolve("tree-sitter-wasms/package.json");
    return path.join(path.dirname(pkgPath), "out");
  } catch {
    return path.resolve(process.cwd(), "node_modules", "tree-sitter-wasms", "out");
  }
}

let cached: GrammarSpec[] | null = null;

export function listAvailableGrammars(): GrammarSpec[] {
  if (cached) return cached;
  const dir = resolveWasmsDir();
  const candidates: GrammarSpec[] = [
    { language: "typescript", extensions: [".ts"], wasm: "tree-sitter-typescript.wasm" },
    { language: "tsx", extensions: [".tsx"], wasm: "tree-sitter-tsx.wasm" },
    { language: "python", extensions: [".py"], wasm: "tree-sitter-python.wasm" },
    { language: "go", extensions: [".go"], wasm: "tree-sitter-go.wasm" },
    { language: "java", extensions: [".java"], wasm: "tree-sitter-java.wasm" },
    { language: "rust", extensions: [".rs"], wasm: "tree-sitter-rust.wasm" },
  ];
  cached = candidates.flatMap((c) => {
    const full = path.join(dir, c.wasm);
    return fs.existsSync(full) ? [{ ...c, wasm: full }] : [];
  });
  return cached;
}

export function detectLanguage(relPath: string): Language | null {
  const ext = path.extname(relPath).toLowerCase();
  for (const g of listAvailableGrammars()) {
    if (g.extensions.includes(ext)) return g.language;
  }
  return null;
}

export function findGrammar(language: Language): GrammarSpec | null {
  return listAvailableGrammars().find((g) => g.language === language) ?? null;
}

export function supportedLanguages(): Language[] {
  return listAvailableGrammars().map((g) => g.language);
}
