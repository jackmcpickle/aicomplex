import type { Language } from "../discover/detect.js";

/**
 * Everything aic3 needs to know about one language.
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
export interface LanguagePack {
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
   * Captures `@smell.<kind>` at constructs that hide problems.
   *
   * Queries over-capture on purpose — an empty catch and a full one look the
   * same to a query — and `validateSmell` in the index builder decides which
   * captures survive.
   */
  smells: string;

  /**
   * Node types that add a branch to a function's control flow. Used for
   * cyclomatic complexity, which is otherwise identical across languages.
   */
  branchNodes: readonly string[];
  /**
   * Node types that indent their contents — a strict subset of `branchNodes`.
   *
   * These are kept separate because most branches do not nest. An `else if`
   * chain, a switch with forty cases, and a chained ternary are all flat to
   * read but form a deep right-leaning AST. Counting those as nesting made a
   * 40-case dispatch function report a depth of 51.
   */
  nestingNodes: readonly string[];
  /** Node types that are function-like, used to attribute code to a symbol. */
  functionNodes: readonly string[];
  /**
   * Leaf node types that carry a name.
   *
   * Counting these gives a cheap answer to "is this name mentioned anywhere
   * else?" that covers type annotations, property access and every other
   * reference form a query would otherwise have to enumerate individually.
   */
  identifierNodes: readonly string[];
}

/**
 * Ways code hides a problem instead of handling it.
 *
 * GitClear measured error-masking constructs rising 47% as AI assistance
 * spread. The mechanism is that an agent asked to make something work will
 * silence the failure when it cannot fix the cause, and a silenced failure
 * looks identical to a fixed one in review.
 */
export const SMELL_KINDS = [
  "empty-catch",
  "bare-except",
  "ignore-comment",
  "any-type",
] as const;

export type SmellKind = (typeof SMELL_KINDS)[number];

const SMELL_KIND_SET: ReadonlySet<string> = new Set(SMELL_KINDS);

export function isSmellKind(value: string): value is SmellKind {
  return SMELL_KIND_SET.has(value);
}

/** Definition kinds aic3 recognises, in order of specificity. */
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
export function moreSpecificKind(
  a: DefinitionKind,
  b: DefinitionKind
): DefinitionKind {
  return (KIND_PRIORITY.get(a) ?? 99) <= (KIND_PRIORITY.get(b) ?? 99) ? a : b;
}

const DEFINITION_KIND_SET: ReadonlySet<string> = new Set(DEFINITION_KINDS);

export function isDefinitionKind(value: string): value is DefinitionKind {
  return DEFINITION_KIND_SET.has(value);
}
