import type { FunctionNode } from "../index/types.js";
import type { ScoredIndex } from "../index/scope.js";
import { percent, type Analyzer } from "./types.js";

/**
 * Function bodies that are structurally identical to another body.
 *
 * GitClear found blocks of 5+ duplicated lines rose 8x as AI assistance
 * spread, and duplicated blocks carry 15–50% more defects than unique ones —
 * a fix applied to one copy silently leaves the others wrong.
 *
 * Matching is on the AST shape with identifiers and literals erased, so a
 * copied function whose variables were renamed still counts. Token-based
 * detectors like jscpd miss exactly that case, which is the one agents
 * produce most.
 */
export const duplication: Analyzer = {
  name: "duplication",
  pillar: "slop",
  describe: "Share of function bodies with a structural twin elsewhere",

  run(index: ScoredIndex) {
    const candidates = index.functions.filter(
      (fn) => fn.shapeSize >= MIN_SHAPE_SIZE,
    );

    const byShape = new Map<string, FunctionNode[]>();
    for (const fn of candidates) {
      const bucket = byShape.get(fn.shapeHash);
      if (bucket) bucket.push(fn);
      else byShape.set(fn.shapeHash, [fn]);
    }

    const clusters = [...byShape.values()].filter((group) => group.length > 1);
    const duplicated = clusters.reduce((sum, group) => sum + group.length, 0);

    return {
      metric: percent(duplicated, candidates.length),
      unit: "% of function bodies duplicated elsewhere",
      findings: clusters.map((group) => ({
        kind: "duplicate-body" as const,
        file: group[0]!.file,
        line: group[0]!.startLine,
        copies: group.length,
        lines: group[0]!.lines,
        files: new Set(group.map((fn) => fn.file)).size,
        names: [...new Set(group.map((fn) => fn.name))],
        weight: group.length * group[0]!.lines,
      })),
    };
  },
};

/**
 * Below this, bodies match by coincidence rather than by copying — every
 * one-line getter in a codebase has the same shape.
 */
const MIN_SHAPE_SIZE = 25;
