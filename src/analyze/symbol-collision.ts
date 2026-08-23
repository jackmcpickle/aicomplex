import type { ScoredIndex } from "../index/scope.js";
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
 * Only shipped source counts. A `setup` helper repeated across every spec, or
 * a `getSizing` repeated across every benchmark, is normal and costs an agent
 * nothing.
 *
 * Methods are excluded too. Ten classes implementing `run` is polymorphism
 * working as intended, and an agent finds `Analyzer.run` through the type
 * rather than by grepping the bare name. Counting those punished aicc's own
 * analyzer interface.
 */
export const symbolCollision: Analyzer = {
  name: "symbol-collision",
  pillar: "findability",
  describe: "Share of definitions whose name does not uniquely identify them",

  run(index: ScoredIndex) {
    const buckets = new Map<string, string[]>();

    const counts = (id: string) => {
      const symbol = index.symbols.get(id);
      return symbol !== undefined && symbol.kind !== "method";
    };

    for (const [name, ids] of index.symbolsByName) {
      const fromSource = ids.filter(counts);
      if (fromSource.length > 1) buckets.set(name, fromSource);
    }

    const sourceSymbols = [...index.symbols.keys()].filter(counts).length;

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
