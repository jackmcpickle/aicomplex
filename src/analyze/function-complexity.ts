import type { ScoredIndex } from "../index/scope.js";
import { percent, type Analyzer } from "./types.js";

/**
 * Functions with more branching or nesting than can be held in mind at once.
 *
 * Complexity is McCabe's count of independent paths, computed from the AST.
 * Depth is how far blocks nest. Depth is the harsher of the two in practice:
 * a flat function with twelve early returns reads fine, while four levels of
 * nesting means every line carries four conditions of context.
 *
 * A function is flagged when either measure crosses its threshold.
 */
export const functionComplexity: Analyzer = {
  name: "function-complexity",
  pillar: "context-cost",
  describe: "Share of functions too branchy or too deeply nested to follow",

  run(index: ScoredIndex) {
    const functions = index.functions;
    const hard = functions.filter(
      (fn) => fn.complexity > MAX_COMPLEXITY || fn.maxDepth > MAX_DEPTH,
    );

    return {
      metric: percent(hard.length, functions.length),
      unit: `% of functions over complexity ${MAX_COMPLEXITY} or depth ${MAX_DEPTH}`,
      findings: hard.map((fn) => ({
        kind: "hard-function" as const,
        file: fn.file,
        line: fn.startLine,
        symbol: fn.name,
        complexity: fn.complexity,
        maxDepth: fn.maxDepth,
        lines: fn.lines,
        weight: fn.complexity + fn.maxDepth * 3,
      })),
    };
  },
};

/** The conventional McCabe threshold, and the depth past which nesting dominates. */
const MAX_COMPLEXITY = 10;
const MAX_DEPTH = 4;
