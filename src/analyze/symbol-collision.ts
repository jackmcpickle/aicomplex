import type { CodeIndex } from "../index/types.js";
import { percent, type Analyzer } from "./types.js";

/**
 * How often a symbol name points at more than one definition.
 *
 * This is the most direct measure of whether grep works. When an agent greps
 * for `handler` and gets nine definitions back, it has to read all nine to
 * find the one that matters — and it will frequently pick wrong. Repos grown
 * by agents accumulate these fast, because each new module gets its own
 * locally-sensible `validate`, `format`, or `Config`.
 *
 * Test files are excluded. A `describe` helper repeated across specs is
 * normal and costs an agent nothing.
 */
export const symbolCollision: Analyzer = {
  name: "symbol-collision",
  pillar: "findability",
  describe: "Share of definitions whose name does not uniquely identify them",

  run(index: CodeIndex) {
    const buckets = new Map<string, string[]>();

    for (const [name, ids] of index.symbolsByName) {
      const fromSource = ids.filter((id) => {
        const symbol = index.symbols.get(id);
        return symbol && !index.files.get(symbol.file)?.isTest;
      });
      if (fromSource.length > 1) buckets.set(name, fromSource);
    }

    const sourceSymbols = [...index.symbols.values()].filter(
      (symbol) => !index.files.get(symbol.file)?.isTest,
    ).length;

    const ambiguous = [...buckets.values()].reduce((sum, ids) => sum + ids.length, 0);

    const findings = [...buckets.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 25)
      .map(([name, ids]) => {
        const files = new Set(ids.map((id) => index.symbols.get(id)!.file));
        return {
          message: `"${name}" is defined ${ids.length} times across ${files.size} files`,
          symbol: name,
          file: index.symbols.get(ids[0]!)!.file,
          weight: ids.length,
        };
      });

    return {
      analyzer: symbolCollision.name,
      pillar: symbolCollision.pillar,
      metric: percent(ambiguous, sourceSymbols),
      unit: "% of definitions with an ambiguous name",
      findings,
    };
  },
};
