import type { ScoredIndex } from "../index/scope.js";
import { isLikelyEntrypoint } from "./entrypoints.js";
import { percent, type Analyzer } from "./types.js";

/**
 * Exports nothing in the codebase uses.
 *
 * A dead export is worse than a dead private function, because it looks like
 * public API. An agent reading it has no way to tell that changing it is free,
 * so it gets preserved, worked around, and eventually re-implemented next to
 * itself. Agents create these steadily: everything gets exported by default,
 * whether or not anything needs it.
 *
 * Resolution is name-based, so this errs toward calling things used. An export
 * only counts as dead when its name appears nowhere else at all, and exports
 * of entrypoint files are never counted — those are public API, and a library
 * not calling its own surface is the point of a library.
 */
export const deadExports: Analyzer = {
  name: "dead-exports",
  pillar: "slop",
  describe: "Share of exported symbols nothing in the codebase references",

  run(index: ScoredIndex) {
    const exported = [...index.symbols.values()].filter(
      (symbol) => symbol.exported && !isLikelyEntrypoint(symbol.file),
    );

    const dead = exported.filter((symbol) => !isReferenced(index, symbol.name));

    return {
      analyzer: deadExports.name,
      pillar: deadExports.pillar,
      metric: percent(dead.length, exported.length),
      unit: "% of exports nothing references",
      findings: dead
        .sort((a, b) => b.endLine - b.startLine - (a.endLine - a.startLine))
        .slice(0, 25)
        .map((symbol) => ({
          message: `${symbol.name} (${symbol.kind}) is exported but never used`,
          file: symbol.file,
          line: symbol.startLine,
          symbol: symbol.name,
          weight: symbol.endLine - symbol.startLine + 1,
        })),
    };
  },
};

/**
 * Whether a name is mentioned anywhere beyond its own definitions.
 *
 * Every definition contributes one occurrence of its own name, so a name is
 * referenced once it occurs more often than that. This deliberately errs
 * toward "used": a name shared with something unrelated will look alive, which
 * is the safe direction for an analyzer that accuses code of being dead.
 */
function isReferenced(index: ScoredIndex, name: string): boolean {
  const occurrences = index.identifierCounts.get(name) ?? 0;
  const definitions = index.symbolsByName.get(name)?.length ?? 1;
  return occurrences > definitions;
}
