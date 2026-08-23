import { SCORED_ROLES } from "../discover/role.js";
import type { CodeIndex, FileNode } from "./types.js";

declare const scopedBrand: unique symbol;

/**
 * A `CodeIndex` narrowed to the files that count toward the score.
 *
 * Benchmarks, examples, scripts, docs and tests break the assumptions every
 * metric rests on — repeated names and unimported files are correct there — so
 * judging them turns real signal into noise. That rule used to be a comment
 * asking each analyzer to call `isScored` on everything it touched, which
 * nothing enforced. Now the narrowing happens once and analyzers cannot see
 * anything else.
 *
 * The brand exists solely so a raw `CodeIndex` fails to type-check where a
 * scored one is required.
 */
export type ScoredIndex = Omit<CodeIndex, "identifierCounts" | "failures"> & {
  /**
   * Identifier occurrences summed across scored files only.
   *
   * Flat here, per-file on `CodeIndex`, because counts cannot be un-summed
   * once merged.
   */
  identifierCounts: Map<string, number>;
  readonly [scopedBrand]: true;
};

/**
 * Computed once per `CodeIndex`.
 *
 * Analyzers, scoring and the report all need the same narrowed view; keyed on
 * identity so asking three times costs one pass.
 */
const cache = new WeakMap<CodeIndex, ScoredIndex>();

export function scopeIndex(index: CodeIndex): ScoredIndex {
  const existing = cache.get(index);
  if (existing) return existing;

  const scoped = narrow(index);
  cache.set(index, scoped);
  return scoped;
}

function narrow(index: CodeIndex): ScoredIndex {
  const files = new Map(
    [...index.files].filter(([, file]) => SCORED_ROLES.has(file.role)),
  );
  const keeps = (path: string) => files.has(path);

  const symbols = new Map([...index.symbols].filter(([, symbol]) => keeps(symbol.file)));

  const symbolsByName = new Map<string, string[]>();
  for (const symbol of symbols.values()) {
    const bucket = symbolsByName.get(symbol.name);
    if (bucket) bucket.push(symbol.id);
    else symbolsByName.set(symbol.name, [symbol.id]);
  }

  const identifierCounts = new Map<string, number>();
  for (const [path, counts] of index.identifierCounts) {
    if (!keeps(path)) continue;
    for (const [name, count] of counts) {
      identifierCounts.set(name, (identifierCounts.get(name) ?? 0) + count);
    }
  }

  return {
    root: index.root,
    files,
    symbols,
    symbolsByName,
    identifierCounts,
    // An import or call is evidence only when both ends are shipped source.
    imports: index.imports.filter(
      (edge) => keeps(edge.from) && (edge.resolved === null || keeps(edge.resolved)),
    ),
    calls: index.calls.filter((call) => keeps(call.from)),
    functions: index.functions.filter((fn) => keeps(fn.file)),
    smells: index.smells.filter((smell) => keeps(smell.file)),
  } as ScoredIndex;
}

/** Every file that counts toward the score. For callers holding a full index. */
export function scoredFiles(index: CodeIndex): FileNode[] {
  return [...scopeIndex(index).files.values()];
}
