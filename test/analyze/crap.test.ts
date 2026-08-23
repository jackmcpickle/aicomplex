import { describe, expect, it, onTestFinished } from "vitest";
import { crap, crapScore } from "../../src/analyze/crap.js";
import { scopeIndex } from "../../src/index/scope.js";
import { indexFixture } from "../helpers/index-fixture.js";

describe("crapScore", () => {
  it("is just complexity when everything is covered", () => {
    expect(crapScore(11, 100)).toBe(11);
    expect(crapScore(1, 100)).toBe(1);
  });

  it("is complexity squared plus complexity when nothing is covered", () => {
    expect(crapScore(11, 0)).toBe(121 + 11);
    expect(crapScore(3, 0)).toBe(9 + 3);
  });

  it("cubes the uncovered share, so partial tests help disproportionately", () => {
    // 11² × 0.6³ + 11
    expect(crapScore(11, 40)).toBeCloseTo(37.136, 3);
    // Halving the uncovered share cuts the risk term eightfold, not twofold.
    expect(crapScore(11, 50) - 11).toBeCloseTo((crapScore(11, 0) - 11) / 8, 6);
  });

  it("leaves a simple function low even with no tests at all", () => {
    expect(crapScore(1, 0)).toBe(2);
    expect(crapScore(2, 0)).toBe(6);
  });
});

/** An lcov record: every line in `covered` was hit, every line in `missed` was not. */
function lcov(file: string, covered: number[], missed: number[]): string {
  return [
    `SF:${file}`,
    ...covered.map((line) => `DA:${line},1`),
    ...missed.map((line) => `DA:${line},0`),
    "end_of_record",
    "",
  ].join("\n");
}

const BRANCHY = `export function branchy(n: number) {
  if (n === 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  if (n === 4) return 4;
  if (n === 5) return 5;
  return 0;
}
`;

describe("crap analyzer", () => {
  it("says so rather than scoring zero when there is no lcov report", async () => {
    const index = await indexFixture({ "src/a.ts": BRANCHY }, onTestFinished);

    const result = crap.run(scopeIndex(index));

    expect(result.metric).toBe(0);
    expect(result.findings).toEqual([{ kind: "coverage-missing", weight: 1 }]);
    expect(result.unit).toContain("no lcov");
  });

  it("scores a branchy uncovered function badly", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": BRANCHY,
        "coverage/lcov.info": lcov("src/a.ts", [], [2, 3, 4, 5, 6, 7]),
      },
      onTestFinished,
    );

    const result = crap.run(scopeIndex(index));
    const worst = result.findings.find((finding) => finding.kind === "crap-function");

    expect(worst?.coverage).toBe(0);
    expect(worst?.crap).toBe(crapScore(worst!.complexity, 0));
    expect(result.metric).toBe(100); // Over all three bands.
  });

  it("scores the same function well once it is covered", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": BRANCHY,
        "coverage/lcov.info": lcov("src/a.ts", [2, 3, 4, 5, 6, 7], []),
      },
      onTestFinished,
    );

    const result = crap.run(scopeIndex(index));
    const bands = result.findings.find((finding) => finding.kind === "crap-bands");

    expect(bands?.over30).toBe(0);
    expect(bands?.over15).toBe(0);
    expect(result.metric).toBeLessThan(50);
  });

  it("averages the three bands rather than using one cutoff", async () => {
    const index = await indexFixture(
      {
        // One branchy uncovered function, three trivial covered ones.
        "src/a.ts": BRANCHY,
        "src/b.ts": "export const one = () => 1;\nexport const two = () => 2;\nexport const three = () => 3;\n",
        "coverage/lcov.info":
          lcov("src/a.ts", [], [2, 3, 4, 5, 6, 7]) + lcov("src/b.ts", [1, 2, 3], []),
      },
      onTestFinished,
    );

    const result = crap.run(scopeIndex(index));
    const bands = result.findings.find((finding) => finding.kind === "crap-bands")!;

    expect(bands.functions).toBe(4);
    expect(bands.over5).toBe(25); // Only the branchy one.
    expect(result.metric).toBeCloseTo((bands.over5 + bands.over15 + bands.over30) / 3, 6);
  });

  it("ignores functions the coverage report never instrumented", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": BRANCHY,
        "src/untested.ts": "export function other() { return 1; }",
        "coverage/lcov.info": lcov("src/a.ts", [2, 3, 4, 5, 6, 7], []),
      },
      onTestFinished,
    );

    const bands = crap.run(scopeIndex(index)).findings.find((f) => f.kind === "crap-bands");

    // untested.ts is absent from the report: unknown, which is not zero.
    expect(bands?.functions).toBe(1);
  });

  it("never lets a test file's own coverage into the numbers", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": BRANCHY,
        "src/a.test.ts": BRANCHY,
        "coverage/lcov.info":
          lcov("src/a.ts", [2, 3, 4, 5, 6, 7], []) + lcov("src/a.test.ts", [], [2, 3, 4, 5, 6, 7]),
      },
      onTestFinished,
    );

    const bands = crap.run(scopeIndex(index)).findings.find((f) => f.kind === "crap-bands");

    expect(bands?.functions).toBe(1);
  });
});
