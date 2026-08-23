import { scopeIndex } from "../index/scope.js";
import type { CodeIndex } from "../index/types.js";
import { barrelDepth } from "./barrel-depth.js";
import { crap } from "./crap.js";
import { crossFileConnectivity } from "./cross-file-connectivity.js";
import { deadExports } from "./dead-exports.js";
import { duplication } from "./duplication.js";
import { errorMasking } from "./error-masking.js";
import type { Finding } from "./findings.js";
import { functionComplexity } from "./function-complexity.js";
import { godFiles } from "./god-files.js";
import { importCycles } from "./import-cycles.js";
import { orphanFiles } from "./orphan-files.js";
import { symbolCollision } from "./symbol-collision.js";
import type { Analyzer, AnalyzerResult } from "./types.js";

/**
 * Every analyzer aicc runs.
 *
 * Order here is the order they appear in the report. An analyzer earns its
 * place by separating good repos from bad ones on the calibration corpus; one
 * that fires the same on both is noise and should be removed rather than kept
 * "just in case".
 */
export const ANALYZERS: readonly Analyzer[] = [
  symbolCollision,
  orphanFiles,
  barrelDepth,
  importCycles,
  crossFileConnectivity,
  godFiles,
  functionComplexity,
  duplication,
  errorMasking,
  deadExports,
  crap,
];

/**
 * How many findings any one analyzer contributes.
 *
 * The report shows a handful; the rest exist so `--json` consumers can see
 * more than the headline without the payload growing without bound.
 */
const MAX_FINDINGS = 25;

/**
 * The single door into the analyzer set.
 *
 * Narrowing happens here, once, so no analyzer can be handed anything but
 * shipped source and no caller has to remember to do it. Ranking and capping
 * happen here too, for the same reason — they used to be a line every analyzer
 * repeated at the bottom of its `run`, with one quietly using a different cap.
 */
export function runAnalyzers(index: CodeIndex): AnalyzerResult[] {
  const scored = scopeIndex(index);

  return ANALYZERS.map((analyzer) => {
    const measured = analyzer.run(scored);
    return {
      ...measured,
      analyzer: analyzer.name,
      findings: [...measured.findings]
        .toSorted(worstFirst)
        .slice(0, MAX_FINDINGS),
      pillar: analyzer.pillar,
    };
  });
}

/**
 * Worst first, then by location.
 *
 * The tiebreak is what makes two runs over an unchanged repo produce the same
 * report. Weight alone leaves equal-weight findings in whatever order the
 * analyzer happened to build them, which shuffles as unrelated code moves.
 */
function worstFirst(a: Finding, b: Finding): number {
  if (b.weight !== a.weight) {
    return b.weight - a.weight;
  }
  return (
    (a.file ?? "").localeCompare(b.file ?? "") || (a.line ?? 0) - (b.line ?? 0)
  );
}

export * from "./types.js";
