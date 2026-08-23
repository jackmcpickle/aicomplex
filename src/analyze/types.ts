import type { ScoredIndex } from "../index/scope.js";
import type { Finding } from "./findings.js";

export const PILLARS = [
  "findability",
  "traceability",
  "context-cost",
  "slop",
  "change-risk",
] as const;

export type Pillar = (typeof PILLARS)[number];

/**
 * What an analyzer measured.
 *
 * Deliberately does not name the analyzer or its pillar: those are facts the
 * analyzer already declares, and asking `run` to repeat them back meant every
 * implementation ended with `analyzer: godFiles.name, pillar: godFiles.pillar`.
 * `runAnalyzers` stamps them on.
 */
export type Measurement = {
  /**
   * The analyzer's headline number, always normalised so higher means worse
   * and the value is comparable across repos of different sizes.
   */
  metric: number;
  /** What `metric` counts, for the report. e.g. "% of symbols". */
  unit: string;
  /**
   * In any order, uncapped. `runAnalyzers` ranks by weight and keeps the
   * worst `MAX_FINDINGS`, so no analyzer has to remember to.
   */
  findings: Finding[];
};

export type AnalyzerResult = Measurement & {
  analyzer: string;
  pillar: Pillar;
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
  run(index: ScoredIndex): Measurement;
};

/** Convenience for analyzers that need a size-relative percentage. */
export function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : (part / whole) * 100;
}

export type { Finding } from "./findings.js";
