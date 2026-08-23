import { describe, expect, it, onTestFinished } from "vitest";

import { runAnalyzers } from "../../src/analyze/index.js";
import type { CodeIndex } from "../../src/index/types.js";
import { renderTerminalReport } from "../../src/report/terminal.js";
import { ANCHORS } from "../../src/score/anchors.js";
import { scoreIndex } from "../../src/score/score.js";
import { indexFixture } from "../helpers/index-fixture.js";

/**
 * A small repo with something wrong in it, so the report has findings to show.
 *
 * `test/` and `scripts/` are here to exercise the "not scored" line: they are
 * indexed but never judged, and the report says so rather than letting the
 * file count silently disagree with what was measured.
 */
const FIXTURE = {
  "scripts/build.ts": "console.log('build');\n",
  "src/a.ts": [
    "export function tangled(n: number): number {",
    "  let total = 0;",
    "  for (let i = 0; i < n; i++) {",
    "    if (i % 2 === 0) {",
    "      if (i % 3 === 0) total += i;",
    "      else if (i % 5 === 0) total -= i;",
    "      else if (i % 7 === 0) total += 2;",
    "      else if (i % 11 === 0) total += 3;",
    "      else total += 1;",
    "    } else if (i % 13 === 0) {",
    "      while (total > 100) total -= 10;",
    "      total *= 2;",
    "    } else if (i % 17 === 0 && total < 0) {",
    "      total = 0;",
    "    } else if (i % 19 === 0 || total > 1000) {",
    "      total -= 1;",
    "    }",
    "  }",
    "  return total;",
    "}",
    "",
    "export function unused() {}",
  ].join("\n"),
  "src/b.ts":
    "import { tangled } from './a.js';\nexport const twice = (n: number) => tangled(n) * 2;\n",
  "test/a.test.ts": "import { tangled } from '../src/a.js';\ntangled(1);\n",
};

async function render(options?: Parameters<typeof renderTerminalReport>[3]) {
  const index = await indexFixture(FIXTURE, onTestFinished);
  const results = runAnalyzers(index);
  return {
    index,
    report: renderTerminalReport(
      index,
      results,
      scoreIndex(index, results),
      options
    ),
  };
}

describe(renderTerminalReport, () => {
  it("leads with the root, the counts, and the score", async () => {
    const { index, report } = await render();

    expect(report).toContain(index.root);
    expect(report).toContain("2 scored files");
    expect(report).toMatch(/SLOP \d+\/100 {2}[A-F]/u);
    expect(report).toMatch(
      /\d+ from metrics, [+-]\d+ for size \(\d+ lines across 2 files\)/u
    );
  });

  it("names the roles it left out of the score", async () => {
    const { report } = await render();

    expect(report).toContain("not scored:");
    expect(report).toContain("1 test");
    expect(report).toContain("1 script");
  });

  it("groups metrics under their pillar, with the pillar's score", async () => {
    const { report } = await render();

    expect(report).toContain("Findability — can an agent locate things?");
    expect(report).toContain("Context cost — how much must it read?");
    expect(report).toContain(
      "Change risk — complexity nothing tests (not scored)"
    );
    expect(report).toMatch(
      /Findability — can an agent locate things\? {2}\d+\/100/u
    );
    // Analyzer name and its unit, on the metric's own line.
    expect(report).toMatch(
      /symbol-collision +% of definitions with an ambiguous name/u
    );
  });

  it("renders findings as sentences under their metric", async () => {
    const { report } = await render();

    expect(report).toContain("tangled has complexity");
    expect(report).toContain("unused (function) is exported but never used");
  });

  it("caps findings at the requested detail and counts the rest", async () => {
    const { index, report } = await render({ detail: 0 });
    const results = runAnalyzers(index);
    const most = Math.max(...results.map((result) => result.findings.length));

    expect(report).not.toContain("has complexity");
    expect(report).toContain(`…and ${most} more`);
  });

  it("shows the anchors and wrapped reasoning only when asked why", async () => {
    const { report: plain } = await render();
    const { report: why } = await render({ why: true });

    expect(plain).not.toContain("good ≤");
    expect(plain).toContain("Run with --why");

    expect(why).toMatch(
      /good ≤ \d+(\.\d+)? · bad ≥ \d+(\.\d+)? · scored \d+\/100/u
    );
    expect(why).not.toContain("Run with --why");

    // The rationale is wrapped into a paragraph rather than left as one long
    // line: every line comes out shorter than the longest reasoning string.
    const longestReason = Math.max(
      ...Object.values(ANCHORS).map((a) => a.rationale.length)
    );
    const longestLine = Math.max(...why.split("\n").map((line) => line.length));

    expect(longestReason > 100 && longestLine < longestReason).toBeTruthy();
  });

  it("always says the thresholds are reasoned rather than measured", async () => {
    const { report } = await render();

    expect(report).toContain("Thresholds are reasoned, not corpus-derived");
  });

  it("lists files it could not parse instead of dropping them", async () => {
    const index = await indexFixture(FIXTURE, onTestFinished);
    const failures: CodeIndex["failures"] = Array.from(
      { length: 7 },
      (_, i) => ({
        path: `src/broken-${i}.ts`,
        reason: "unreadable",
      })
    );
    const withFailures: CodeIndex = { ...index, failures };
    const results = runAnalyzers(withFailures);

    const report = renderTerminalReport(
      withFailures,
      results,
      scoreIndex(withFailures, results),
      {}
    );

    expect(report).toContain("Could not parse 7 file(s)");
    expect(report).toContain("src/broken-0.ts — unreadable");
    // Only the first five, so a broken checkout does not bury the report.
    expect(report).not.toContain("src/broken-5.ts");
  });
});
