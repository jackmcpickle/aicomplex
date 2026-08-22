import type { CodeIndex } from "../index/types.js";
import type { SmellKind } from "../parse/language-pack.js";
import { isScored, scoredFiles, type Analyzer } from "./types.js";

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
  name: "error-masking",
  pillar: "slop",
  describe: "Silenced errors, blanket ignores and escape-hatch types per 1k lines",

  run(index: CodeIndex) {
    const smells = index.smells.filter((smell) => isScored(index, smell.file));
    const loc = scoredFiles(index).reduce((sum, file) => sum + file.loc, 0);

    const byKind = new Map<SmellKind, number>();
    const byFile = new Map<string, number>();
    for (const smell of smells) {
      byKind.set(smell.kind, (byKind.get(smell.kind) ?? 0) + 1);
      byFile.set(smell.file, (byFile.get(smell.file) ?? 0) + 1);
    }

    const findings = [...byKind.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([kind, count]) => ({
        message: `${count} × ${DESCRIPTIONS[kind]}`,
        file: smells.find((smell) => smell.kind === kind)!.file,
        line: smells.find((smell) => smell.kind === kind)!.line,
        weight: count,
      }));

    const worstFile = [...byFile.entries()].sort((a, b) => b[1] - a[1])[0];
    if (worstFile && worstFile[1] > 1) {
      findings.push({
        message: `worst file: ${worstFile[0]} with ${worstFile[1]}`,
        file: worstFile[0],
        line: 1,
        weight: worstFile[1],
      });
    }

    return {
      analyzer: errorMasking.name,
      pillar: errorMasking.pillar,
      metric: loc === 0 ? 0 : (smells.length / loc) * 1000,
      unit: "masked errors per 1k lines",
      findings,
    };
  },
};

const DESCRIPTIONS: Record<SmellKind, string> = {
  "empty-catch": "catch block that discards the error",
  "bare-except": "except clause whose body only passes",
  "ignore-comment": "comment disabling a linter or type check",
  "any-type": "`any`, which switches off type checking locally",
};
