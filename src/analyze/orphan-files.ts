import type { ScoredIndex } from "../index/scope.js";
import { isLikelyEntrypoint } from "./entrypoints.js";
import { percent, type Analyzer } from "./types.js";

/**
 * Files that nothing in the codebase imports.
 *
 * Every orphan is a file an agent may read, edit, and be misled by, while the
 * running program never touches it. Agents produce these steadily: a helper
 * gets written, the approach changes, the helper is never deleted because
 * nothing fails when it stays.
 *
 * Plausible entrypoints are excluded, since being unimported is their job.
 */
export const orphanFiles: Analyzer = {
  name: "orphan-files",
  pillar: "findability",
  describe: "Share of source files that nothing imports",

  run(index: ScoredIndex) {
    const imported = new Set<string>();
    for (const edge of index.imports) {
      if (edge.resolved) imported.add(edge.resolved);
    }

    // Go's package model means files in a package are used without importing
    // one another, so unimported Go files say nothing. Only judge languages
    // where imports are file-to-file.
    const judged = [...index.files.values()].filter(
      (file) => file.language !== "go" && !isLikelyEntrypoint(file.path),
    );
    const orphans = judged.filter((file) => !imported.has(file.path));

    return {
      metric: percent(orphans.length, judged.length),
      unit: "% of source files nothing imports",
      findings: orphans.map((file) => ({
        kind: "orphan" as const,
        file: file.path,
        loc: file.loc,
        weight: file.loc,
      })),
    };
  },
};

