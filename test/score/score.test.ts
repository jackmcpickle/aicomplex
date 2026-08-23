import { describe, expect, it, onTestFinished } from "vitest";
import { runAnalyzers } from "../../src/analyze/index.js";
import type { AnalyzerResult } from "../../src/analyze/types.js";
import type { CodeIndex } from "../../src/index/types.js";
import { scoreIndex, severityOf } from "../../src/score/score.js";
import { indexFixture } from "../helpers/index-fixture.js";

/** An index carrying nothing but a line count, for testing the size term. */
function indexOfSize(loc: number): CodeIndex {
  return {
    root: ".",
    files: new Map([
      [
        "src/a.ts",
        {
          path: "src/a.ts",
          language: "typescript" as const,
          bytes: loc * 30,
          loc,
          lines: loc,
          role: "source" as const,
          hash: "x",
        },
      ],
    ]),
    symbols: new Map(),
    symbolsByName: new Map(),
    identifierCounts: new Map(),
    imports: [],
    calls: [],
    functions: [],
    smells: [],
    failures: [],
    coverage: null,
  };
}

function results(metric: number): AnalyzerResult[] {
  return [
    { analyzer: "duplication", pillar: "slop", metric, unit: "%", findings: [] },
  ];
}

describe("severityOf", () => {
  it("scores nothing at or below the good anchor", () => {
    expect(severityOf("duplication", 0)).toBe(0);
    expect(severityOf("duplication", 2)).toBe(0);
  });

  it("scores everything at or above the bad anchor", () => {
    expect(severityOf("duplication", 25)).toBe(100);
    expect(severityOf("duplication", 90)).toBe(100); // Flat, not 360.
  });

  it("interpolates between the anchors", () => {
    expect(severityOf("duplication", 13.5)).toBeCloseTo(50, 0);
  });

  it("returns null for a metric with no anchor", () => {
    expect(severityOf("not-a-metric", 50)).toBeNull();
  });
});

describe("scoreIndex", () => {
  it("scores a clean codebase at zero", async () => {
    const index = await indexFixture(
      {
        "src/index.ts": "import { helper } from './util.js';\nexport const run = () => helper();",
        "src/util.ts": "export function helper() { return 1; }",
      },
      onTestFinished,
    );

    const score = scoreIndex(index, runAnalyzers(index));

    expect(score.score).toBe(0);
    expect(score.grade).toBe("A");
  });

  it("keeps the score inside 0–100 even when every metric is maxed", () => {
    const maxed: AnalyzerResult[] = [
      { analyzer: "symbol-collision", pillar: "findability", metric: 100, unit: "%", findings: [] },
      { analyzer: "import-cycles", pillar: "traceability", metric: 100, unit: "%", findings: [] },
      { analyzer: "god-files", pillar: "context-cost", metric: 100, unit: "%", findings: [] },
      { analyzer: "duplication", pillar: "slop", metric: 100, unit: "%", findings: [] },
    ];

    const score = scoreIndex(indexOfSize(500_000), maxed);

    expect(score.score).toBeLessThanOrEqual(100);
    expect(score.score).toBeGreaterThan(90);
    expect(score.grade).toBe("F");
  });

  it("weights the same problems higher in a larger codebase", () => {
    const small = scoreIndex(indexOfSize(1_000), results(25));
    const large = scoreIndex(indexOfSize(1_000_000), results(25));

    expect(large.base).toBe(small.base); // Same metrics.
    expect(large.score).toBeGreaterThan(small.score); // Different cost.
  });

  it("charges a large codebase for its size even with no defects", () => {
    const clean = results(0);

    expect(scoreIndex(indexOfSize(1_000), clean).score).toBe(0);
    expect(scoreIndex(indexOfSize(1_000_000), clean).score).toBeGreaterThan(5);
  });

  it("reports how much of the score came from size", () => {
    const score = scoreIndex(indexOfSize(1_000_000), results(25));

    expect(score.size.adjustment).toBeCloseTo(score.score - score.base, 5);
    expect(score.size.loc).toBe(1_000_000);
    expect(score.size.factor).toBe(1);
  });

  it("gives a small codebase the benefit of the doubt", () => {
    const score = scoreIndex(indexOfSize(1_000), results(25));

    expect(score.size.factor).toBe(0);
    expect(score.score).toBeLessThan(score.base);
  });

  it("groups metric severities under their pillar", () => {
    const score = scoreIndex(indexOfSize(10_000), results(25));

    expect(score.pillars).toHaveLength(1);
    expect(score.pillars[0]?.pillar).toBe("slop");
    expect(score.pillars[0]?.metrics[0]).toMatchObject({
      analyzer: "duplication",
      raw: 25,
      severity: 100,
    });
  });

  it("never improves the grade as a metric gets worse", () => {
    const order = ["A", "B", "C", "D", "F"];
    const grades = [0, 5, 10, 15, 20, 25, 40].map(
      (metric) => scoreIndex(indexOfSize(10_000), results(metric)).grade,
    );

    for (let i = 1; i < grades.length; i++) {
      expect(order.indexOf(grades[i]!)).toBeGreaterThanOrEqual(order.indexOf(grades[i - 1]!));
    }
  });

  it("spans the full range of grades", () => {
    // duplication maps 2% → 0 severity and 25% → 100, so these raw values land
    // at roughly 10, 25, 40, 60 and 85 before the size adjustment.
    const grades = [4.3, 7.75, 11.2, 15.8, 21.6].map(
      (metric) => scoreIndex(indexOfSize(10_000), results(metric)).grade,
    );

    expect(grades).toEqual(["A", "B", "C", "D", "F"]);
  });
});

describe("anchor reasoning", () => {
  it("carries the anchor pair and its rationale with every metric", () => {
    const [metric] = scoreIndex(indexOfSize(1000), results(13.5)).pillars[0]!.metrics;

    expect(metric).toMatchObject({
      analyzer: "duplication",
      good: 2,
      bad: 25,
      why: expect.stringContaining("GitClear"),
    });
  });

  it("explains every metric it scores", () => {
    const score = scoreIndex(indexOfSize(1000), results(10));

    for (const pillar of score.pillars) {
      for (const metric of pillar.metrics) {
        expect(metric.why.length, metric.analyzer).toBeGreaterThan(20);
        expect(metric.bad, metric.analyzer).toBeGreaterThan(metric.good);
      }
    }
  });
});
