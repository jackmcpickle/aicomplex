import type { ScoredIndex } from "../index/scope.js";
import { percent, type Analyzer } from "./types.js";

/**
 * How far a re-export chain separates an import site from the real definition.
 *
 * Barrel files are the single worst thing for agent navigation in JavaScript
 * and TypeScript. `import { thing } from "@/lib"` tells an agent nothing about
 * where `thing` lives; it has to open `lib/index.ts`, find the re-export, and
 * repeat — often several times. Humans lean on their editor's go-to-definition
 * for this. An agent grepping for `export.*thing` lands on the barrel, not the
 * source.
 *
 * The metric is the share of internal import edges that land on a file which
 * mostly forwards rather than defines.
 */
export const barrelDepth: Analyzer = {
  name: "barrel-depth",
  pillar: "findability",
  describe: "Share of internal imports that land on a re-export barrel",

  run(index: ScoredIndex) {
    const barrels = findBarrels(index);
    const internal = index.imports.filter((edge) => edge.resolved !== null);
    const throughBarrel = internal.filter((edge) => barrels.has(edge.resolved!));

    const hops = new Map<string, number>();
    for (const barrel of barrels) {
      hops.set(barrel, chainLength(index, barrel, barrels, new Set()));
    }

    return {
      metric: percent(throughBarrel.length, internal.length),
      unit: "% of internal imports routed through a barrel",
      findings: [...barrels]
        .map((barrel) => ({
          barrel,
          uses: throughBarrel.filter((edge) => edge.resolved === barrel).length,
          chain: hops.get(barrel) ?? 1,
        }))
        .filter((entry) => entry.uses > 0)
        .map((entry) => ({
          kind: "barrel" as const,
          file: entry.barrel,
          uses: entry.uses,
          chain: entry.chain,
          weight: entry.uses * entry.chain,
        })),
    };
  },
};

/**
 * A file is a barrel when it re-exports and defines little or nothing itself.
 *
 * The "defines little" test matters: a module with one re-export alongside
 * real code is a normal module, not an indirection layer.
 */
function findBarrels(index: ScoredIndex): Set<string> {
  const reExportsByFile = new Map<string, number>();
  for (const edge of index.imports) {
    if (edge.kind !== "reexport") continue;
    reExportsByFile.set(edge.from, (reExportsByFile.get(edge.from) ?? 0) + 1);
  }

  const ownDefinitions = new Map<string, number>();
  for (const symbol of index.symbols.values()) {
    ownDefinitions.set(symbol.file, (ownDefinitions.get(symbol.file) ?? 0) + 1);
  }

  const barrels = new Set<string>();
  for (const [file, reExports] of reExportsByFile) {
    if (reExports >= (ownDefinitions.get(file) ?? 0)) barrels.add(file);
  }
  return barrels;
}

/** Longest chain of barrel-to-barrel re-exports starting at `file`. */
function chainLength(
  index: ScoredIndex,
  file: string,
  barrels: ReadonlySet<string>,
  seen: Set<string>,
): number {
  if (seen.has(file)) return 0; // Cyclic barrels: stop rather than recurse forever.
  seen.add(file);

  let deepest = 0;
  for (const edge of index.imports) {
    if (edge.from !== file || edge.kind !== "reexport" || !edge.resolved) continue;
    const next = barrels.has(edge.resolved)
      ? chainLength(index, edge.resolved, barrels, seen)
      : 0;
    deepest = Math.max(deepest, next);
  }

  return deepest + 1;
}
