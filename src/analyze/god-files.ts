import type { CodeIndex } from "../index/types.js";
import { percent, scoredFiles, type Analyzer } from "./types.js";

/**
 * How much of the codebase sits in files too large to read in one go.
 *
 * This is the most literal agent cost in the tool. An agent that must open a
 * 2,000-line file to change ten of them pays for the whole file in context,
 * every time, and its attention over that span is measurably worse than over
 * a focused one. Large files also make edits less reliable, because the model
 * has more opportunity to match the wrong region.
 *
 * The metric is the share of lines living in oversized files, not the share
 * of files — one 5,000-line module matters more than twenty 400-line ones.
 */
export const godFiles: Analyzer = {
  name: "god-files",
  pillar: "context-cost",
  describe: "Share of code sitting in files too large to read in one pass",

  run(index: CodeIndex) {
    const files = scoredFiles(index);
    const totalLoc = files.reduce((sum, file) => sum + file.loc, 0);
    const oversized = files.filter((file) => file.loc > LARGE_FILE_LOC);
    const oversizedLoc = oversized.reduce((sum, file) => sum + file.loc, 0);

    return {
      analyzer: godFiles.name,
      pillar: godFiles.pillar,
      metric: percent(oversizedLoc, totalLoc),
      unit: `% of lines in files over ${LARGE_FILE_LOC} lines`,
      findings: oversized
        .sort((a, b) => b.loc - a.loc)
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
 * 400 lines. Past this a file rarely holds one responsibility, and it stops
 * fitting comfortably alongside everything else an agent needs in context.
 */
const LARGE_FILE_LOC = 400;

/** Rough token count. ~3.5 bytes per token is close enough for code. */
function estimateTokens(file: { bytes: number }): string {
  const tokens = Math.round(file.bytes / 3.5);
  return tokens > 1000 ? `${(tokens / 1000).toFixed(1)}k` : `${tokens}`;
}
