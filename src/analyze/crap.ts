import { coverageOfSpan } from "../discover/lcov.js";
import type { ScoredIndex } from "../index/scope.js";
import type { Finding } from "./findings.js";
import { percent, type Analyzer } from "./types.js";

/**
 * Change Risk Anti-Patterns — complexity that nothing tests.
 *
 *     CRAP(f) = complexity² × (1 − coverage)³ + complexity
 *
 * Savoia and Evans, Crap4j (2007). The shape of it is the argument: coverage
 * is cubed, so a complex function that is well tested is nearly as safe to
 * change as a simple one, while an untested complex function is punished
 * hard. Complexity alone is not a risk — complexity you cannot verify is.
 *
 * This is the only metric aicc cannot compute from source alone, so it is
 * reported but deliberately left out of the Slop Score. Two repos' scores stay
 * comparable whether or not either has been tested; see the `change-risk`
 * pillar having no anchors in `src/score/anchors.ts`.
 *
 * Three thresholds rather than one. `maxCrap: 30` is the conventional single
 * cutoff, but a repo where every function sits at 29 and one where they sit at
 * 6 both score zero against it. Reporting the share over 5, 15 and 30 and
 * averaging them gives a number that moves with the whole distribution: a
 * function over 30 counts in all three bands, one over 5 counts in one.
 *
 * A caveat worth knowing: aicc's cyclomatic complexity is not identical to
 * eslint-plugin-crap's. aicc attributes a nested function's branches to that
 * function rather than to its parent, and does not count `&&`/`||` as decision
 * points. Expect the same function to score somewhat lower here.
 */
export const crap: Analyzer = {
  name: "crap",
  pillar: "change-risk",
  describe: "Complexity weighted by how little of it is covered by tests",

  run(index: ScoredIndex) {
    if (index.coverage === null) {
      return {
        metric: 0,
        unit: "no lcov report found",
        findings: [{ kind: "coverage-missing", weight: 1 } satisfies Finding],
      };
    }

    const scored: { file: string; line: number; name: string; complexity: number; coverage: number; crap: number }[] =
      [];

    for (const fn of index.functions) {
      const coverage = coverageOfSpan(index.coverage.get(fn.file), fn.startLine, fn.endLine);
      if (coverage === null) continue; // Not instrumented: unknown, not zero.

      scored.push({
        file: fn.file,
        line: fn.startLine,
        name: fn.name,
        complexity: fn.complexity,
        coverage,
        crap: crapScore(fn.complexity, coverage),
      });
    }

    if (scored.length === 0) {
      return {
        metric: 0,
        unit: "no covered functions in the lcov report",
        findings: [{ kind: "coverage-missing", weight: 1 } satisfies Finding],
      };
    }

    const bands = BANDS.map((threshold) => ({
      threshold,
      share: percent(scored.filter((entry) => entry.crap > threshold).length, scored.length),
    }));

    const findings: Finding[] = [
      {
        kind: "crap-bands",
        functions: scored.length,
        over5: bands[0]!.share,
        over15: bands[1]!.share,
        over30: bands[2]!.share,
        // Ranks above every individual function, so the summary leads. Finite
        // because Infinity serialises to null in JSON.
        weight: Number.MAX_SAFE_INTEGER,
      },
      ...scored
        .filter((entry) => entry.crap > BANDS[0]!)
        .map((entry) => ({
          kind: "crap-function" as const,
          file: entry.file,
          line: entry.line,
          symbol: entry.name,
          crap: entry.crap,
          complexity: entry.complexity,
          coverage: entry.coverage,
          weight: entry.crap,
        })),
    ];

    return {
      metric: bands.reduce((sum, band) => sum + band.share, 0) / bands.length,
      unit: `% of functions over CRAP ${BANDS.join(" / ")}, averaged`,
      findings,
    };
  },
};

/** The three cutoffs the range score is built from. */
export const BANDS = [5, 15, 30] as const;

/** `coverage` is a percentage, 0–100. */
export function crapScore(complexity: number, coverage: number): number {
  const uncovered = 1 - coverage / 100;
  return complexity * complexity * uncovered ** 3 + complexity;
}
