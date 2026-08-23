import type { ScoredIndex } from "../index/scope.js";
import type { SmellKind } from "../parse/language-pack.js";
import type { Finding } from "./findings.js";
import type { Analyzer } from "./types.js";

/**
 * Constructs that hide a problem rather than handle it.
 *
 * GitClear measured these rising 47% between 2023 and 2026. The mechanism is
 * that an agent asked to make something work will silence a failure it cannot
 * fix, and a silenced failure is indistinguishable from a fixed one in review.
 * Each one also removes a signal the next agent would have needed.
 *
 * Reported per thousand lines so the number means the same thing in a small
 * repo and a large one.
 */
export const errorMasking: Analyzer = {
  describe:
    "Silenced errors, blanket ignores and escape-hatch types per 1k lines",
  name: "error-masking",
  pillar: "slop",
  run(index: ScoredIndex) {
    const { smells } = index;
    const loc = [...index.files.values()].reduce(
      (sum, file) => sum + file.loc,
      0
    );

    const byKind = new Map<SmellKind, number>();
    const byFile = new Map<string, number>();
    for (const smell of smells) {
      byKind.set(smell.kind, (byKind.get(smell.kind) ?? 0) + 1);
      byFile.set(smell.file, (byFile.get(smell.file) ?? 0) + 1);
    }

    const findings: Finding[] = [...byKind.entries()].flatMap(
      ([kind, count]) => {
        const first = smells.find((smell) => smell.kind === kind);
        if (first === undefined) {
          return [];
        }
        return [
          {
            kind: "masked-errors",
            smell: kind,
            count,
            file: first.file,
            line: first.line,
            weight: count,
          },
        ];
      }
    );

    const [worstFile] = [...byFile.entries()].toSorted((a, b) => b[1] - a[1]);
    if (worstFile !== undefined && worstFile[1] > 1) {
      findings.push({
        kind: "worst-masking-file",
        file: worstFile[0],
        count: worstFile[1],
        line: 1,
        weight: worstFile[1],
      });
    }

    return {
      metric: loc === 0 ? 0 : (smells.length / loc) * 1000,
      unit: "masked errors per 1k lines",
      findings,
    };
  },
};
