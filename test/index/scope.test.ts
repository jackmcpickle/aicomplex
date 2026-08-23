import { describe, expect, it, onTestFinished } from "vitest";
import { deadExports } from "../../src/analyze/dead-exports.js";
import { orphanFiles } from "../../src/analyze/orphan-files.js";
import { scopeIndex } from "../../src/index/scope.js";
import { indexFixture } from "../helpers/index-fixture.js";

describe("scopeIndex", () => {
  it("keeps only files whose role is scored", async () => {
    const index = await indexFixture(
      {
        "src/thing.ts": "export const thing = 1;",
        "src/thing.test.ts": "it('works', () => {});",
        "bench/speed.ts": "export const speed = 1;",
        "scripts/seed.ts": "export const seed = 1;",
      },
      onTestFinished,
    );

    expect(index.files.size).toBe(4);
    expect([...scopeIndex(index).files.keys()]).toEqual(["src/thing.ts"]);
  });

  it("sums identifier counts across scored files only", async () => {
    const index = await indexFixture(
      {
        "src/thing.ts": "export function shared() {}",
        "src/thing.test.ts": "shared(); shared(); shared();",
      },
      onTestFinished,
    );

    // Once for the definition in source; the three test mentions are dropped.
    expect(scopeIndex(index).identifierCounts.get("shared")).toBe(1);
  });

  it("drops import edges that start outside shipped source", async () => {
    const index = await indexFixture(
      {
        "src/helper.ts": "export const helper = 1;",
        "src/helper.test.ts": "import { helper } from './helper.js';",
      },
      onTestFinished,
    );

    expect(index.imports).toHaveLength(1);
    expect(scopeIndex(index).imports).toHaveLength(0);
  });

  it("returns the same object for the same index", async () => {
    const index = await indexFixture({ "src/a.ts": "export const a = 1;" }, onTestFinished);

    expect(scopeIndex(index)).toBe(scopeIndex(index));
  });
});

/**
 * Both of these used to be hidden: a test importing a file made it look
 * reachable, and a test mentioning a name made it look referenced. Neither is
 * true of the shipped codebase, which is the thing aicc claims to measure.
 */
describe("scoping changes what counts as reachable", () => {
  it("counts a file imported only by a test as an orphan", async () => {
    const index = await indexFixture(
      {
        "src/index.ts": "export const root = 1;",
        "src/helper.ts": "export const helper = 1;",
        "src/helper.test.ts": "import { helper } from './helper.js';",
      },
      onTestFinished,
    );

    const result = orphanFiles.run(scopeIndex(index));

    expect(result.findings.map((f) => f.file)).toContain("src/helper.ts");
  });

  it("counts an export used only by a test as dead", async () => {
    const index = await indexFixture(
      {
        "src/thing.ts": "export function onlyInTests() {}",
        "src/thing.test.ts": "onlyInTests();",
      },
      onTestFinished,
    );

    const result = deadExports.run(scopeIndex(index));

    expect(result.findings.map((f) => f.symbol)).toContain("onlyInTests");
  });
});
