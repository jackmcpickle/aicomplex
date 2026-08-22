import { SCORED_ROLES } from "../discover/role.js";
import type { CodeIndex, FileNode } from "../index/types.js";

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
 * A pure function over the index.
 *
 * Analyzers never read the filesystem, parse, or call the network. That keeps
 * them individually testable against a hand-built index and makes the whole
 * scoring pass deterministic.
 */
export type Analyzer = {
  name: string;
  pillar: Pillar;
  /** Shown in the report to explain what the number means. */
  describe: string;
  run(index: CodeIndex): AnalyzerResult;
};

/** Convenience for analyzers that need a size-relative percentage. */
export function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : (part / whole) * 100;
}

/**
 * Whether a file counts toward the score.
 *
 * Every analyzer must gate on this. Benchmarks, examples, scripts and docs
 * break the assumptions the metrics rest on — repeated names and unimported
 * files are correct there — so including them turns real signal into noise.
 */
export function isScored(index: CodeIndex, filePath: string): boolean {
  const file = index.files.get(filePath);
  return file !== undefined && SCORED_ROLES.has(file.role);
}

/** Every file that counts toward the score. */
export function scoredFiles(index: CodeIndex): FileNode[] {
  return [...index.files.values()].filter((file) => SCORED_ROLES.has(file.role));
}
