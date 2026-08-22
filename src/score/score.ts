import type { AnalyzerResult, Pillar } from "../analyze/types.js";
import { PILLARS, scoredFiles } from "../analyze/types.js";
import type { CodeIndex } from "../index/types.js";
import { ANCHORS, PILLAR_WEIGHTS } from "./anchors.js";

export type MetricScore = {
  analyzer: string;
  pillar: Pillar;
  /** The analyzer's own number, in its own unit. */
  raw: number;
  /** 0–100, where 0 is at or better than the good anchor. */
  severity: number;
};

export type PillarScore = {
  pillar: Pillar;
  score: number;
  metrics: MetricScore[];
};

export type SlopScore = {
  /** 0–100, higher is worse. */
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  /** The score before size is taken into account. */
  base: number;
  size: SizeContext;
  pillars: PillarScore[];
};

export type SizeContext = {
  loc: number;
  files: number;
  /** 0 at 1k lines, 1 at 1M lines. Drives both size adjustments. */
  factor: number;
  /** How much the size adjustment moved the score, in points. */
  adjustment: number;
};

/**
 * Maps a raw metric value onto 0–100.
 *
 * Linear between the anchors and flat outside them, so a repo that is twice as
 * far past `bad` does not score 200. A metric with no anchor is skipped rather
 * than guessed at.
 */
export function severityOf(analyzer: string, raw: number): number | null {
  const anchor = ANCHORS[analyzer];
  if (!anchor) return null;

  const { good, bad } = anchor;
  if (bad === good) return raw > good ? 100 : 0;

  return clamp(((raw - good) / (bad - good)) * 100);
}

/**
 * Combines every metric into one number.
 *
 * Size enters twice, deliberately:
 *
 * A given proportion of duplication or cycles costs more in a large codebase
 * than a small one, because the chance an agent ever sees enough of it to
 * notice drops as the codebase grows. So problems are weighted up with scale.
 *
 * Separately, scale is itself a cost. A million-line codebase with no
 * measurable defects is still harder to work in than a two-thousand-line one,
 * so a floor is added that depends only on size.
 */
export function scoreIndex(index: CodeIndex, results: AnalyzerResult[]): SlopScore {
  const metrics: MetricScore[] = [];

  for (const result of results) {
    const severity = severityOf(result.analyzer, result.metric);
    if (severity === null) continue;
    metrics.push({
      analyzer: result.analyzer,
      pillar: result.pillar,
      raw: result.metric,
      severity,
    });
  }

  const pillars: PillarScore[] = PILLARS.map((pillar) => {
    const forPillar = metrics.filter((metric) => metric.pillar === pillar);
    return {
      pillar,
      score: mean(forPillar.map((metric) => metric.severity)),
      metrics: forPillar,
    };
  }).filter((entry) => entry.metrics.length > 0);

  const base = weightedMean(
    pillars.map((entry) => [entry.score, PILLAR_WEIGHTS[entry.pillar]] as const),
  );

  const size = measureSize(index);
  const score = clamp(base * problemWeight(size.factor) + sizeBurden(size.factor));

  return {
    score,
    grade: gradeOf(score),
    base,
    size: { ...size, adjustment: score - base },
    pillars,
  };
}

function measureSize(index: CodeIndex): Omit<SizeContext, "adjustment"> {
  const files = scoredFiles(index);
  const loc = files.reduce((sum, file) => sum + file.loc, 0);

  // 1k lines → 0, 1M lines → 1, on a log scale because the difference between
  // 1k and 10k matters as much as between 100k and 1M.
  const factor = clamp(Math.log10(Math.max(loc, 1) / 1_000) / 3, 0, 1);

  return { loc, files: files.length, factor };
}

/** Problems count for 0.85x in a tiny codebase and 1.15x in a huge one. */
function problemWeight(factor: number): number {
  return 0.85 + 0.3 * factor;
}

/** Up to 10 points of unavoidable burden that scale alone imposes. */
function sizeBurden(factor: number): number {
  return 10 * factor;
}

function gradeOf(score: number): SlopScore["grade"] {
  if (score < 15) return "A";
  if (score < 30) return "B";
  if (score < 50) return "C";
  if (score < 70) return "D";
  return "F";
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function weightedMean(pairs: readonly (readonly [number, number])[]): number {
  const totalWeight = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  if (totalWeight === 0) return 0;
  return pairs.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight;
}

function clamp(value: number, low = 0, high = 100): number {
  return Math.min(high, Math.max(low, value));
}
