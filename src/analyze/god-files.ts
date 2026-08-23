import type { FileNode } from "../index/types.js";
import type { ScoredIndex } from "../index/scope.js";
import { type Analyzer } from "./types.js";

/**
 * How big the file is that a randomly chosen line lives in.
 *
 * This is the most literal agent cost in the tool: to change one line you open
 * the whole file, pay for it in context, and work with attention spread across
 * all of it. So the useful question is not how many files are large, but how
 * large the file is that an arbitrary edit lands in.
 *
 * An earlier version measured the share of lines in files over 400 lines. That
 * read 65–70% on every real codebase — cobra, flask, vite and zod alike —
 * because large files hold most lines almost by definition. It ranked nothing.
 * The line-weighted median separates the same repos cleanly: 84 lines for this
 * codebase, 572 for flask, 722 for vite, 885 for cobra, 1717 for zod.
 */
export const godFiles: Analyzer = {
  name: "god-files",
  pillar: "context-cost",
  describe: "Size of the file a randomly chosen line lives in",

  run(index: ScoredIndex) {
    const files = [...index.files.values()].sort((a, b) => a.loc - b.loc);
    const totalLoc = files.reduce((sum, file) => sum + file.loc, 0);

    return {
      metric: lineWeightedPercentile(files, totalLoc, 0.5),
      unit: "lines in the file a random line lives in",
      findings: files
        .filter((file) => file.loc > NOTABLE_LOC)
        .map((file) => ({
          kind: "large-file" as const,
          file: file.path,
          loc: file.loc,
          bytes: file.bytes,
          weight: file.loc,
        })),
    };
  },
};

/**
 * The size of the file containing the line at percentile `p`.
 *
 * Files must be sorted ascending by `loc`. Weighting by lines rather than by
 * file is what makes one 5,000-line module count for more than twenty
 * 250-line ones.
 */
function lineWeightedPercentile(
  files: readonly FileNode[],
  totalLoc: number,
  p: number,
): number {
  if (totalLoc === 0) return 0;

  let seen = 0;
  for (const file of files) {
    seen += file.loc;
    if (seen >= totalLoc * p) return file.loc;
  }
  return files.at(-1)?.loc ?? 0;
}

/** Files below this are not worth naming in the report, whatever the median is. */
const NOTABLE_LOC = 400;
