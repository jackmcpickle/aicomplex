import type { CodeIndex, FileNode } from "../index/types.js";
import { scoredFiles, type Analyzer } from "./types.js";

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

  run(index: CodeIndex) {
    const files = scoredFiles(index).sort((a, b) => a.loc - b.loc);
    const totalLoc = files.reduce((sum, file) => sum + file.loc, 0);

    return {
      analyzer: godFiles.name,
      pillar: godFiles.pillar,
      metric: lineWeightedPercentile(files, totalLoc, 0.5),
      unit: "lines in the file a random line lives in",
      findings: files
        .slice()
        .reverse()
        .filter((file) => file.loc > NOTABLE_LOC)
        .slice(0, 25)
        .map((file) => ({
          message: `${file.path} is ${file.loc} lines — roughly ${estimateTokens(file)} tokens to read`,
          file: file.path,
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

/** Rough token count. ~3.5 bytes per token is close enough for code. */
function estimateTokens(file: FileNode): string {
  const tokens = Math.round(file.bytes / 3.5);
  return tokens > 1000 ? `${(tokens / 1000).toFixed(1)}k` : `${tokens}`;
}
