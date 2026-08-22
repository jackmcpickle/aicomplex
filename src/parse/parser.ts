import { createRequire } from "node:module";
import { Language as TSLanguage, Parser, Query } from "web-tree-sitter";
import type { Language } from "../discover/detect.js";
import type { LanguagePack } from "./language-pack.js";
import { goPack } from "./packs/go.js";
import { javascriptPack } from "./packs/javascript.js";
import { pythonPack } from "./packs/python.js";
import { tsxPack, typescriptPack } from "./packs/typescript.js";

const require = createRequire(import.meta.url);

const PACKS: Record<Language, LanguagePack> = {
  typescript: typescriptPack,
  tsx: tsxPack,
  javascript: javascriptPack,
  python: pythonPack,
  go: goPack,
};

export type CompiledLanguage = {
  pack: LanguagePack;
  parser: Parser;
  queries: {
    definitions: Query;
    imports: Query;
    exports: Query;
    calls: Query;
  };
};

let initialised: Promise<void> | null = null;
const compiled = new Map<Language, Promise<CompiledLanguage>>();

/**
 * Loads a grammar, compiles its queries, and caches the result.
 *
 * Loading is lazy and per-language: scanning a pure-Python repo never pays to
 * load the TypeScript grammar. Concurrent callers share one in-flight promise.
 */
export function getLanguage(language: Language): Promise<CompiledLanguage> {
  let existing = compiled.get(language);
  if (!existing) {
    existing = compile(language);
    compiled.set(language, existing);
  }
  return existing;
}

async function compile(language: Language): Promise<CompiledLanguage> {
  initialised ??= Parser.init();
  await initialised;

  const pack = PACKS[language];
  const grammar = await TSLanguage.load(require.resolve(pack.wasmSpecifier));

  const parser = new Parser();
  parser.setLanguage(grammar);

  return {
    pack,
    parser,
    queries: {
      definitions: buildQuery(grammar, pack, "definitions"),
      imports: buildQuery(grammar, pack, "imports"),
      exports: buildQuery(grammar, pack, "exports"),
      calls: buildQuery(grammar, pack, "calls"),
    },
  };
}

/**
 * Compiles one query, and fails loudly if it does not match the grammar.
 *
 * A query that references a node type the grammar lacks is a bug in the pack,
 * not something to degrade past — every metric downstream would silently
 * report zero.
 */
function buildQuery(
  grammar: TSLanguage,
  pack: LanguagePack,
  name: "definitions" | "imports" | "exports" | "calls",
): Query {
  try {
    return new Query(grammar, pack[name]);
  } catch (cause) {
    throw new Error(
      `aicc: the "${name}" query for ${pack.language} does not compile against its grammar`,
      { cause },
    );
  }
}

/** Parses source text. Returns null when tree-sitter cannot produce a tree. */
export async function parseSource(language: Language, source: string) {
  const { parser } = await getLanguage(language);
  return parser.parse(source);
}
