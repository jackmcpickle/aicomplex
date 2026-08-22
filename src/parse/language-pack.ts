import type { Language } from "../discover/detect.js";

/**
 * Everything aicc needs to know about one language.
 *
 * Queries are held as source strings rather than `.scm` files on disk so that
 * the published package has no runtime asset resolution to get wrong. They are
 * compiled once per language and cached.
 *
 * Each query must compile against its own grammar and no other, because
 * tree-sitter rejects queries that name node types the grammar does not have.
 * That is why TypeScript and JavaScript get separate packs even though the
 * TypeScript grammar is a superset.
 */
export type LanguagePack = {
  language: Language;
  /** npm subpath of the grammar's prebuilt WASM. */
  wasmSpecifier: string;

  /** Captures `@definition.<kind>` on the whole node, `@name` on its identifier. */
  definitions: string;
  /** Captures `@import.source`, and optionally `@import.name` / `@import.kind`. */
  imports: string;
  /** Captures `@export.name` for anything the module exposes. */
  exports: string;
  /** Captures `@call.name` at every call site. */
  calls: string;

  /**
   * Node types that add a branch to a function's control flow. Used for
   * cyclomatic complexity, which is otherwise identical across languages.
   */
  branchNodes: readonly string[];
  /** Node types that are function-like, used to attribute code to a symbol. */
  functionNodes: readonly string[];
};

/** Definition kinds aicc recognises, in order of specificity. */
export const DEFINITION_KINDS = [
  "method",
  "function",
  "class",
  "interface",
  "type",
  "enum",
  "constant",
  "variable",
] as const;

export type DefinitionKind = (typeof DEFINITION_KINDS)[number];

const KIND_PRIORITY = new Map(DEFINITION_KINDS.map((kind, i) => [kind, i]));

/**
 * When two patterns match the same node, keep the more specific kind — an
 * arrow function assigned to a `const` is a function, not a variable.
 */
export function moreSpecificKind(a: DefinitionKind, b: DefinitionKind): DefinitionKind {
  return (KIND_PRIORITY.get(a) ?? 99) <= (KIND_PRIORITY.get(b) ?? 99) ? a : b;
}

export function isDefinitionKind(value: string): value is DefinitionKind {
  return KIND_PRIORITY.has(value as DefinitionKind);
}
