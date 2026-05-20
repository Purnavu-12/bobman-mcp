import { createRequire as nodeCreateRequire } from "node:module";
import { findGrammar, type Language } from "./registry.js";

interface ParserInstance {
  setLanguage: (lang: unknown) => unknown;
  parse: (text: string) => { rootNode: unknown } | null;
  delete: () => void;
}

interface ParserCtor {
  new (): ParserInstance;
  init: () => Promise<void>;
  Language: { load: (input: string | Uint8Array) => Promise<unknown> };
}

const RECYCLE_FILES = parseInt(process.env.BOBMAN_ANALYZER_RECYCLE_FILES ?? "1000", 10);

let parserCtor: ParserCtor | null = null;
let initialized = false;

function loadCtor(): ParserCtor {
  if (parserCtor) return parserCtor;
  const req = nodeCreateRequire(import.meta.url);
  const mod = req("web-tree-sitter") as ParserCtor | { default: ParserCtor };
  const ctor = (mod as { default?: ParserCtor }).default ?? (mod as ParserCtor);
  parserCtor = ctor;
  return ctor;
}

async function ensureInit(): Promise<void> {
  if (initialized) return;
  const ctor = loadCtor();
  await ctor.init();
  initialized = true;
}

export interface ParseResult {
  rootNode: unknown;
}

export class ParserPool {
  private languageCache = new Map<Language, unknown>();
  private parserInstance: ParserInstance | null = null;
  private currentLanguage: Language | null = null;
  private filesProcessedSinceRecycle = 0;
  recycles = 0;

  async loadLanguage(language: Language): Promise<unknown> {
    if (this.languageCache.has(language)) return this.languageCache.get(language)!;
    const grammar = findGrammar(language);
    if (!grammar) throw new Error(`Grammar not available for ${language}`);
    const ctor = loadCtor();
    const lang = await ctor.Language.load(grammar.wasm);
    this.languageCache.set(language, lang);
    return lang;
  }

  private async newParser(): Promise<void> {
    await ensureInit();
    const ctor = loadCtor();
    this.parserInstance = new ctor();
    this.currentLanguage = null;
    this.filesProcessedSinceRecycle = 0;
  }

  private async maybeRecycle(): Promise<void> {
    if (this.filesProcessedSinceRecycle < RECYCLE_FILES) return;
    if (this.parserInstance) {
      this.parserInstance.delete();
      this.parserInstance = null;
      this.recycles += 1;
    }
    await this.newParser();
  }

  async parse(text: string, language: Language): Promise<ParseResult | null> {
    if (!this.parserInstance) await this.newParser();
    if (this.currentLanguage !== language) {
      const lang = await this.loadLanguage(language);
      this.parserInstance!.setLanguage(lang);
      this.currentLanguage = language;
    }
    const tree = this.parserInstance!.parse(text);
    this.filesProcessedSinceRecycle += 1;
    await this.maybeRecycle();
    return tree;
  }

  shutdown(): void {
    if (this.parserInstance) {
      this.parserInstance.delete();
      this.parserInstance = null;
    }
  }
}
