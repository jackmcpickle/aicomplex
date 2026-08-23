import type { Pillar } from "../analyze/types.js";

/**
 * Where each metric stops being fine and starts being a problem.
 *
 * A metric's raw value is mapped to a 0–100 severity by interpolating between
 * `good` and `bad`: at or below `good` it contributes nothing, at or above
 * `bad` it contributes everything.
 *
 * These anchors are reasoned, not corpus-derived. Where a convention exists it
 * is used — McCabe's threshold of 10 for complexity, GitClear's observed
 * duplication rates — and otherwise the pair is set so that a well-regarded
 * library lands near `good` and a codebase known to be hard to work in lands
 * near `bad`. Treat the score as a comparison tool, not a measurement.
 */
export interface Anchor {
  good: number;
  bad: number;
  /** Why these numbers, so they can be argued with rather than trusted. */
  rationale: string;
}

export const ANCHORS: Record<string, Anchor> = {
  "barrel-depth": {
    bad: 20,
    good: 0,
    rationale:
      "Barrels have no lower bound worth tolerating — every one costs an extra hop. One " +
      "import in five going through a barrel makes go-to-definition by grep unreliable.",
  },
  "cross-file-connectivity": {
    bad: 85,
    good: 40,
    rationale:
      "Local calls dominate in any healthy codebase, so the good anchor is high. GitClear " +
      "measured cross-file calls falling 35% under AI assistance; 85% self-contained means " +
      "the modules have stopped forming a system.",
  },
  "dead-exports": {
    bad: 40,
    good: 5,
    rationale:
      "Public API that looks unused is normal in a library. Past 40%, an agent cannot tell " +
      "which exports are real contracts and which are debris.",
  },
  duplication: {
    bad: 25,
    good: 2,
    rationale:
      "GitClear found duplicate blocks rose 8x under AI assistance, and cloned blocks carry " +
      "15–50% more defects. A quarter of bodies having a twin is a copy-paste codebase.",
  },
  "error-masking": {
    bad: 20,
    good: 1,
    rationale:
      "Measured per 1k lines. The odd deliberate suppression is fine; twenty per thousand " +
      "lines means failures are being silenced as a matter of habit.",
  },
  "function-complexity": {
    bad: 10,
    good: 1,
    rationale:
      "McCabe's threshold of 10 has held since 1976. Functions over it should be rare " +
      "exceptions, so 10% of them being over is already bad.",
  },
  "god-files": {
    bad: 1500,
    good: 200,
    rationale:
      "Measured in lines of the file a random line lives in. Around 200 lines an agent can " +
      "hold a whole file at once; at 1500 (~15k tokens) every one-line edit costs a large " +
      "slice of the context window. Measured across a small corpus: flask 572, vite 722, " +
      "cobra 885, zod 1717.",
  },
  "import-cycles": {
    bad: 30,
    good: 0,
    rationale:
      "A cycle has no correct reading order, so the tolerable amount is zero. Past 30% of " +
      "files, no change has a bounded blast radius.",
  },
  "orphan-files": {
    bad: 25,
    good: 2,
    rationale:
      "A couple of stragglers is normal. A quarter of the codebase being unreachable means " +
      "an agent cannot tell live code from abandoned code.",
  },
  "symbol-collision": {
    bad: 40,
    good: 5,
    rationale:
      "Some name reuse is inevitable across a large codebase. Past ~40% of definitions, " +
      "grep stops being a usable way to find anything.",
  },
};

/**
 * How much each pillar contributes.
 *
 * Equal by default. The four costs are genuinely different in kind — finding,
 * following, reading, and being misled — and there is no evidence for ranking
 * one above another, so weighting them would be false precision.
 */
export const PILLAR_WEIGHTS: Record<Pillar, number> = {
  findability: 1,
  traceability: 1,
  "context-cost": 1,
  slop: 1,
  // CRAP needs a coverage report, which most scanned checkouts do not have.
  // Letting it into the score would mean a repo with tests and a repo without
  // are graded on different metrics, and aicc is a comparison tool. It has no
  // anchor either, so `severityOf` skips it and this weight is never used.
  "change-risk": 0,
};
