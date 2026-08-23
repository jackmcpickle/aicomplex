import { scopeIndex } from "../index/scope.js";
import type { CodeIndex } from "../index/types.js";
import { barrelDepth } from "./barrel-depth.js";
import { crossFileConnectivity } from "./cross-file-connectivity.js";
import { deadExports } from "./dead-exports.js";
import { duplication } from "./duplication.js";
import { errorMasking } from "./error-masking.js";
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
];

/**
 * The single door into the analyzer set.
 *
 * Narrowing happens here, once, so no analyzer can be handed anything but
 * shipped source and no caller has to remember to do it.
 */
export function runAnalyzers(index: CodeIndex): AnalyzerResult[] {
  const scored = scopeIndex(index);
  return ANALYZERS.map((analyzer) => analyzer.run(scored));
}

export * from "./types.js";
