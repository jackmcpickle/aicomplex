import type { ScoredIndex } from "../index/scope.js";

export const PILLARS = ["findability", "traceability", "context-cost", "slop"] as const;

export type Pillar = (typeof PILLARS)[number];

/** One concrete thing an agent would trip over, at a specific place in the code. */
export type Finding = {
  /** Human-readable, one line, specific enough to act on. */
  message: string;
  file?: string;
  line?: number;
  symbol?: string;
  /**
   * Relative importance within this analyzer's findings. Used only to rank the
   * report; the score comes from `metric`, not from summing findings.
   */
  weight: number;
};

export type AnalyzerResult = {
  analyzer: string;
  pillar: Pillar;
  /**
   * The analyzer's headline number, always normalised so higher means worse
   * and the value is comparable across repos of different sizes.
   */
  metric: number;
  /** What `metric` counts, for the report. e.g. "% of symbols". */
  unit: string;
  /** Ranked worst-first. Analyzers cap this themselves; the report shows a few. */
  findings: Finding[];
};

/**
 * A pure function over the scored index.
 *
 * Analyzers never read the filesystem, parse, or call the network. That keeps
 * them individually testable against a hand-built index and makes the whole
 * scoring pass deterministic.
 *
 * Taking a `ScoredIndex` rather than a `CodeIndex` means an analyzer cannot
 * see a benchmark, example, script, doc or test file at all. That used to be a
 * rule each analyzer had to remember to apply to everything it touched.
 */
export type Analyzer = {
  name: string;
  pillar: Pillar;
  /** Shown in the report to explain what the number means. */
  describe: string;
  run(index: ScoredIndex): AnalyzerResult;
};

/** Convenience for analyzers that need a size-relative percentage. */
export function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : (part / whole) * 100;
}
