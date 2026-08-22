import type { CodeIndex } from "../index/types.js";
import { isLikelyEntrypoint } from "./entrypoints.js";
import { isScored, percent, type Analyzer } from "./types.js";

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

  run(index: CodeIndex) {
    const used = new Set<string>();

    for (const edge of index.imports) {
      for (const name of edge.names) used.add(name);
    }
    for (const call of index.calls) used.add(call.name);

    // An export re-exported by a barrel is used by that barrel, whatever the
    // rest of the codebase does with it.
    for (const edge of index.imports) {
      if (edge.kind === "reexport") for (const name of edge.names) used.add(name);
    }

    const exported = [...index.symbols.values()].filter(
      (symbol) =>
        symbol.exported && isScored(index, symbol.file) && !isLikelyEntrypoint(symbol.file),
    );

    // A symbol referenced anywhere other than its own definition is alive.
    const dead = exported.filter((symbol) => {
      if (used.has(symbol.name)) return false;
      const definitions = index.symbolsByName.get(symbol.name)?.length ?? 1;
      return definitions === 1;
    });

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
