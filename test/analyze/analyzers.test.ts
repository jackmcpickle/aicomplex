import { describe, expect, it, onTestFinished } from "vitest";

import { barrelDepth } from "../../src/analyze/barrel-depth.js";
import { crossFileConnectivity } from "../../src/analyze/cross-file-connectivity.js";
import type { Finding } from "../../src/analyze/findings.js";
import { importCycles } from "../../src/analyze/import-cycles.js";
import { runAnalyzers } from "../../src/analyze/index.js";
import { orphanFiles } from "../../src/analyze/orphan-files.js";
import { symbolCollision } from "../../src/analyze/symbol-collision.js";
import { scopeIndex } from "../../src/index/scope.js";
import { indexFixture } from "../helpers/index-fixture.js";

describe("symbol-collision", () => {
  it("scores zero when every name is unique", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": "export function alpha() {}",
        "src/b.ts": "export function beta() {}",
      },
      onTestFinished
    );

    expect(symbolCollision.run(scopeIndex(index)).metric).toBe(0);
  });

  it("flags a name defined in several files", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": "export function validate() {}",
        "src/b.ts": "export function validate() {}",
        "src/c.ts": "export function validate() {}",
        "src/d.ts": "export function unique() {}",
      },
      onTestFinished
    );

    const result = symbolCollision.run(scopeIndex(index));

    expect(result.metric).toBe(75); // 3 of 4 definitions are ambiguous.
    expect(result.findings[0]).toMatchObject({
      definitions: 3,
      files: 3,
      kind: "ambiguous-name",
      name: "validate",
    });
  });

  it("ignores collisions that only occur in tests", async () => {
    const index = await indexFixture(
      {
        "src/a.test.ts": "function setup() {}",
        "src/b.test.ts": "function setup() {}",
        "src/c.ts": "export function real() {}",
      },
      onTestFinished
    );

    expect(symbolCollision.run(scopeIndex(index)).metric).toBe(0);
  });
});

describe("orphan-files", () => {
  it("scores zero when everything is reachable", async () => {
    const index = await indexFixture(
      {
        "src/index.ts": "import { used } from './used.js';\nexport { used };",
        "src/used.ts": "export const used = 1;",
      },
      onTestFinished
    );

    expect(orphanFiles.run(scopeIndex(index)).metric).toBe(0);
  });

  it("flags a file nothing imports", async () => {
    const index = await indexFixture(
      {
        "src/index.ts": "import { used } from './used.js';\nexport { used };",
        "src/leftover.ts":
          "export const leftover = 1;\nexport const another = 2;",
        "src/used.ts": "export const used = 1;",
      },
      onTestFinished
    );

    const result = orphanFiles.run(scopeIndex(index));

    expect(result.metric).toBe(50); // leftover.ts of {used.ts, leftover.ts}; index.ts is an entrypoint.
    expect(result.findings[0]?.file).toBe("src/leftover.ts");
  });

  it("does not count entrypoints or tests as orphans", async () => {
    const index = await indexFixture(
      {
        "cli.ts": "export const cli = 1;",
        "scripts/seed.ts": "export const seed = 1;",
        "src/main.ts": "export const main = 1;",
        "src/thing.test.ts": "it('works', () => {});",
      },
      onTestFinished
    );

    expect(orphanFiles.run(scopeIndex(index)).findings).toStrictEqual([]);
  });

  it("does not judge Go, where package files need no imports", async () => {
    const index = await indexFixture(
      {
        "pkg/helper.go": "package pkg\n\nfunc Helper() {}\n",
        "pkg/other.go": "package pkg\n\nfunc Other() {}\n",
      },
      onTestFinished
    );

    expect(orphanFiles.run(scopeIndex(index)).metric).toBe(0);
  });
});

describe("barrel-depth", () => {
  it("scores zero when imports point straight at definitions", async () => {
    const index = await indexFixture(
      {
        "src/main.ts":
          "import { helper } from './util.js';\nexport const main = () => helper();",
        "src/util.ts": "export const helper = () => 1;",
      },
      onTestFinished
    );

    expect(barrelDepth.run(scopeIndex(index)).metric).toBe(0);
  });

  it("flags imports routed through a re-export barrel", async () => {
    const index = await indexFixture(
      {
        "src/lib/index.ts": "export { helper } from './util.js';",
        "src/lib/util.ts": "export const helper = () => 1;",
        "src/main.ts":
          "import { helper } from './lib/index.js';\nexport const main = () => helper();",
      },
      onTestFinished
    );

    const result = barrelDepth.run(scopeIndex(index));

    expect(result.metric).toBe(50); // 1 of 2 internal edges lands on the barrel.
    expect(result.findings[0]?.file).toBe("src/lib/index.ts");
  });

  it("reports how deep a chain of barrels runs", async () => {
    const index = await indexFixture(
      {
        "src/lib/deep/index.ts": "export { helper } from './util.js';",
        "src/lib/deep/util.ts": "export const helper = () => 1;",
        "src/lib/index.ts": "export { helper } from './deep/index.js';",
        "src/main.ts":
          "import { helper } from './lib/index.js';\nexport const main = () => helper();",
      },
      onTestFinished
    );

    expect(barrelDepth.run(scopeIndex(index)).findings).toContainEqual(
      expect.objectContaining({ chain: 2, kind: "barrel" })
    );
  });
});

describe("import-cycles", () => {
  it("scores zero on an acyclic graph", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": "import { b } from './b.js';\nexport const a = () => b();",
        "src/b.ts": "export const b = () => 1;",
      },
      onTestFinished
    );

    expect(importCycles.run(scopeIndex(index)).metric).toBe(0);
  });

  it("flags a two-file cycle", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": "import { b } from './b.js';\nexport const a = () => b();",
        "src/b.ts": "import { a } from './a.js';\nexport const b = () => a();",
      },
      onTestFinished
    );

    const result = importCycles.run(scopeIndex(index));

    expect(result.metric).toBe(100);
    const cycle = result.findings.find((finding) => finding.kind === "cycle");
    expect(cycle?.members).toHaveLength(2);
  });

  it("flags a longer cycle without recursing off the stack", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": "import { b } from './b.js';\nexport const a = () => b();",
        "src/b.ts": "import { c } from './c.js';\nexport const b = () => c();",
        "src/c.ts": "import { a } from './a.js';\nexport const c = () => a();",
        "src/free.ts": "export const free = 1;",
      },
      onTestFinished
    );

    const result = importCycles.run(scopeIndex(index));

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.weight).toBe(3);
    expect(result.metric).toBe(75);
  });
});

describe("cross-file-connectivity", () => {
  it("scores low when code calls across file boundaries", async () => {
    const index = await indexFixture(
      {
        "src/main.ts":
          "import { helper } from './util.js';\nexport function main() { return helper(); }",
        "src/util.ts": "export function helper() { return 1; }",
      },
      onTestFinished
    );

    expect(crossFileConnectivity.run(scopeIndex(index)).metric).toBe(0);
  });

  it("scores high when every file only calls itself", async () => {
    const index = await indexFixture(
      {
        "src/a.ts":
          "function helper() { return 1; }\nexport function a() { return helper(); }",
        "src/b.ts":
          "function other() { return 1; }\nexport function b() { return other(); }",
      },
      onTestFinished
    );

    expect(crossFileConnectivity.run(scopeIndex(index)).metric).toBe(100);
  });

  it("does not flag a file for calling its own private helper", async () => {
    const index = await indexFixture(
      {
        "src/a.ts":
          "function helper() { return 1; }\nexport function a() { return helper(); }",
        "src/b.ts":
          "function other() { return 1; }\nexport function b() { return other(); }",
      },
      onTestFinished
    );

    expect(crossFileConnectivity.run(scopeIndex(index)).findings).toStrictEqual(
      []
    );
  });

  it("flags a local helper whose name is also defined elsewhere", async () => {
    const index = await indexFixture(
      {
        "src/a.ts":
          "function format() { return 1; }\nexport function a() { return format(); }",
        "src/b.ts":
          "function format() { return 1; }\nexport function b() { return format(); }",
      },
      onTestFinished
    );

    const { findings } = crossFileConnectivity.run(scopeIndex(index));

    expect(findings).toHaveLength(2);
    const finding = findings.find(
      (entry): entry is Extract<Finding, { kind: "reimplemented" }> =>
        entry.kind === "reimplemented"
    );
    expect(finding?.alsoDefinedIn).toBe(1);
    expect(finding?.names).toContain("format");
  });

  it("ignores calls into libraries and builtins", async () => {
    const index = await indexFixture(
      { "src/a.ts": "export function a() { return JSON.parse('1'); }" },
      onTestFinished
    );

    expect(crossFileConnectivity.run(scopeIndex(index)).metric).toBe(0);
  });
});

describe(runAnalyzers, () => {
  it("runs every analyzer and returns one result each", async () => {
    const index = await indexFixture(
      { "src/a.ts": "export const a = 1;" },
      onTestFinished
    );

    const results = runAnalyzers(index);

    expect(results.map((r) => r.analyzer)).toStrictEqual([
      "symbol-collision",
      "orphan-files",
      "barrel-depth",
      "import-cycles",
      "cross-file-connectivity",
      "god-files",
      "function-complexity",
      "duplication",
      "error-masking",
      "dead-exports",
      "crap",
    ]);
    for (const result of results) {
      expect(result.metric).toBeGreaterThanOrEqual(0);
      expect(result.metric).toBeLessThanOrEqual(100);
    }
  });

  /**
   * Regression: scanning zod scored `packages/bench` and `packages/docs` as
   * shipped source, which made half its files look orphaned and half its
   * names look ambiguous.
   */
  it("never lets benchmarks, examples, docs or scripts inflate a metric", async () => {
    const noise = {
      "bench/a.ts":
        "function getSizing() { return 1; }\nexport function a() { return getSizing(); }",
      "bench/b.ts":
        "function getSizing() { return 1; }\nexport function b() { return getSizing(); }",
      "bench/c.ts":
        "function getSizing() { return 1; }\nexport function c() { return getSizing(); }",
      "docs/page.ts": "export const page = 1;",
      "examples/demo.ts": "export const demo = 1;",
      "scripts/seed.ts": "export const seed = 1;",
    };

    const clean = await indexFixture(
      {
        "src/index.ts": "export const a = 1;",
        "src/used.ts": "export const used = 1;",
      },
      onTestFinished
    );
    const noisy = await indexFixture(
      {
        "src/index.ts": "export const a = 1;",
        "src/used.ts": "export const used = 1;",
        ...noise,
      },
      onTestFinished
    );

    const before = runAnalyzers(clean);
    const after = runAnalyzers(noisy);

    // Nothing outside shipped source reaches an analyzer at all, so noise may
    // not move a metric in either direction. This used to allow dead-exports
    // to fall, because a name also defined in a benchmark counted as a
    // reference and stopped the export looking confidently dead.
    for (const [i, result] of after.entries()) {
      expect({
        analyzer: result.analyzer,
        metric: result.metric,
      }).toStrictEqual({
        analyzer: result.analyzer,
        metric: before[i]?.metric,
      });
    }
  });

  it("still scores collisions and orphans inside real source", async () => {
    const index = await indexFixture(
      {
        "bench/c.ts": "export function validate() {}",
        "src/a.ts": "export function validate() {}",
        "src/b.ts": "export function validate() {}",
      },
      onTestFinished
    );

    const collision = runAnalyzers(index).find(
      (r) => r.analyzer === "symbol-collision"
    );

    expect(collision?.metric).toBe(100);
    expect(collision?.findings[0]).toMatchObject({
      definitions: 2,
      files: 2,
      kind: "ambiguous-name",
      name: "validate",
    });
  });

  it("produces no findings on a codebase with no source files", async () => {
    const index = await indexFixture(
      { "README.md": "# nothing" },
      onTestFinished
    );

    for (const result of runAnalyzers(index)) {
      expect({
        analyzer: result.analyzer,
        metric: result.metric,
      }).toStrictEqual({
        analyzer: result.analyzer,
        metric: 0,
      });

      // crap is the exception: with no lcov report it says so rather than
      // reporting a clean zero, because unknown is not the same as good.
      const expected =
        result.analyzer === "crap"
          ? [{ kind: "coverage-missing", weight: 1 }]
          : [];
      expect({
        analyzer: result.analyzer,
        findings: result.findings,
      }).toStrictEqual({
        analyzer: result.analyzer,
        findings: expected,
      });
    }
  });
});
