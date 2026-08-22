import type { CodeIndex } from "../index/types.js";
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

  run(index: CodeIndex) {
    const imported = new Set<string>();
    for (const edge of index.imports) {
      if (edge.resolved) imported.add(edge.resolved);
    }

    const candidates = [...index.files.values()].filter(
      (file) => !file.isTest && !isLikelyEntrypoint(file.path),
    );

    // Go's package model means files in a package are used without importing
    // one another, so unimported Go files say nothing. Only judge languages
    // where imports are file-to-file.
    const judged = candidates.filter((file) => file.language !== "go");
    const orphans = judged.filter((file) => !imported.has(file.path));

    return {
      analyzer: orphanFiles.name,
      pillar: orphanFiles.pillar,
      metric: percent(orphans.length, judged.length),
      unit: "% of source files nothing imports",
      findings: orphans
        .sort((a, b) => b.loc - a.loc)
        .slice(0, 25)
        .map((file) => ({
          message: `nothing imports ${file.path} (${file.loc} lines)`,
          file: file.path,
          weight: file.loc,
        })),
    };
  },
};

const ENTRYPOINT_NAMES = new Set([
  "index",
  "main",
  "cli",
  "app",
  "server",
  "worker",
  "setup",
  "conftest",
  "__init__",
  "__main__",
]);

/**
 * True when a file is plausibly a root the program starts from, or is loaded
 * by a tool rather than by an import.
 */
function isLikelyEntrypoint(filePath: string): boolean {
  const segments = filePath.split("/");
  const filename = segments.at(-1)!;
  const stem = filename.slice(0, filename.lastIndexOf(".")) || filename;

  if (ENTRYPOINT_NAMES.has(stem)) return true;
  if (segments.length === 1) return true; // Sitting at the repo root.
  if (/\.config$|\.d$/.test(stem)) return true;
  if (/^(scripts|bin|migrations|tools)\//.test(filePath)) return true;

  return false;
}
