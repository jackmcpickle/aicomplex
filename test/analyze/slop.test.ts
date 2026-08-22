import { describe, expect, it, onTestFinished } from "vitest";
import { deadExports } from "../../src/analyze/dead-exports.js";
import { duplication } from "../../src/analyze/duplication.js";
import { errorMasking } from "../../src/analyze/error-masking.js";
import { functionComplexity } from "../../src/analyze/function-complexity.js";
import { godFiles } from "../../src/analyze/god-files.js";
import { symbolCollision } from "../../src/analyze/symbol-collision.js";
import { indexFixture } from "../helpers/index-fixture.js";

/** A body big enough to clear the duplication analyzer's minimum shape size. */
function body(prefix: string): string {
  return [
    `  const ${prefix}One = compute(${prefix}Input);`,
    `  const ${prefix}Two = ${prefix}One.map((row) => row.value * 2);`,
    `  if (${prefix}Two.length === 0) {`,
    `    return { ok: false, rows: [] };`,
    `  }`,
    `  for (const row of ${prefix}Two) {`,
    `    if (row > 100) {`,
    `      report(row, ${prefix}One);`,
    `    }`,
    `  }`,
    `  return { ok: true, rows: ${prefix}Two };`,
  ].join("\n");
}

describe("duplication", () => {
  it("scores zero when every body is structurally distinct", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": `export function a(aInput: number[]) {\n${body("a")}\n}`,
        "src/b.ts": "export function b() { return 1; }",
      },
      onTestFinished,
    );

    expect(duplication.run(index).metric).toBe(0);
  });

  it("catches a copied body whose variables were all renamed", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": `export function alpha(aInput: number[]) {\n${body("a")}\n}`,
        "src/b.ts": `export function beta(zInput: number[]) {\n${body("z")}\n}`,
      },
      onTestFinished,
    );

    const result = duplication.run(index);

    expect(result.metric).toBe(100);
    expect(result.findings[0]?.message).toContain("2 copies of the same");
    expect(result.findings[0]?.message).toContain("across 2 file(s)");
  });

  it("ignores trivial bodies that coincide by chance", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": "export function a() { return 1; }",
        "src/b.ts": "export function b() { return 2; }",
        "src/c.ts": "export function c() { return 3; }",
      },
      onTestFinished,
    );

    expect(duplication.run(index).metric).toBe(0);
  });
});

describe("error-masking", () => {
  it("scores zero on code that handles its errors", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": "export function a() {\n  try { risky(); } catch (e) { report(e); }\n}",
      },
      onTestFinished,
    );

    expect(errorMasking.run(index).metric).toBe(0);
  });

  it("flags a catch block that discards the error", async () => {
    const index = await indexFixture(
      { "src/a.ts": "export function a() {\n  try { risky(); } catch (e) {}\n}" },
      onTestFinished,
    );

    const result = errorMasking.run(index);

    expect(result.metric).toBeGreaterThan(0);
    expect(result.findings[0]?.message).toContain("catch block that discards the error");
  });

  it("flags a Python except clause whose body only passes", async () => {
    const index = await indexFixture(
      { "app/main.py": "def run():\n    try:\n        risky()\n    except Exception:\n        pass\n" },
      onTestFinished,
    );

    expect(errorMasking.run(index).findings[0]?.message).toContain("only passes");
  });

  it("flags linter and type-checker suppressions", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": "// @ts-ignore\nexport const a = 1;\n// eslint-disable-next-line\nexport const b = 2;",
      },
      onTestFinished,
    );

    expect(errorMasking.run(index).findings[0]?.message).toContain("2 ×");
  });

  it("does not flag ordinary comments", async () => {
    const index = await indexFixture(
      { "src/a.ts": "// this explains the next line\nexport const a = 1;" },
      onTestFinished,
    );

    expect(errorMasking.run(index).metric).toBe(0);
  });

  it("flags `any` as switching off type checking", async () => {
    const index = await indexFixture(
      { "src/a.ts": "export function a(input: any) { return input; }" },
      onTestFinished,
    );

    expect(errorMasking.run(index).findings[0]?.message).toContain("`any`");
  });
});

describe("dead-exports", () => {
  it("scores zero when every export is used", async () => {
    const index = await indexFixture(
      {
        "src/util.ts": "export function helper() { return 1; }",
        "src/main.ts": "import { helper } from './util.js';\nexport function main() { return helper(); }",
      },
      onTestFinished,
    );

    expect(deadExports.run(index).metric).toBe(0);
  });

  it("flags an export nothing references", async () => {
    const index = await indexFixture(
      {
        "src/util.ts": "export function helper() { return 1; }\nexport function unused() { return 2; }",
        "src/main.ts": "import { helper } from './util.js';\nexport function main() { return helper(); }",
      },
      onTestFinished,
    );

    const result = deadExports.run(index);
    const dead = result.findings.map((f) => f.symbol);

    expect(dead).toContain("unused");
    expect(dead).not.toContain("helper");
  });

  it("treats an export used only by a barrel as alive", async () => {
    const index = await indexFixture(
      {
        "src/util.ts": "export function helper() { return 1; }",
        "src/index.ts": "export { helper } from './util.js';",
      },
      onTestFinished,
    );

    expect(deadExports.run(index).findings.map((f) => f.symbol)).not.toContain("helper");
  });
});

describe("god-files", () => {
  it("scores zero when every file is a readable size", async () => {
    const index = await indexFixture(
      { "src/a.ts": "export const a = 1;\n".repeat(50) },
      onTestFinished,
    );

    expect(godFiles.run(index).metric).toBe(0);
  });

  it("measures the share of lines living in oversized files", async () => {
    const index = await indexFixture(
      {
        "src/big.ts": Array.from({ length: 600 }, (_, i) => `export const v${i} = ${i};`).join("\n"),
        "src/small.ts": Array.from({ length: 200 }, (_, i) => `export const s${i} = ${i};`).join("\n"),
      },
      onTestFinished,
    );

    const result = godFiles.run(index);

    expect(result.metric).toBeCloseTo(75, 0); // 600 of 800 lines.
    expect(result.findings[0]?.file).toBe("src/big.ts");
    expect(result.findings[0]?.message).toContain("tokens to read");
  });
});

describe("function-complexity", () => {
  it("scores zero on straightforward functions", async () => {
    const index = await indexFixture(
      { "src/a.ts": "export function a(n: number) { return n + 1; }" },
      onTestFinished,
    );

    expect(functionComplexity.run(index).metric).toBe(0);
  });

  it("flags a deeply nested function", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": [
          "export function a(rows: number[][]) {",
          "  for (const row of rows) {",
          "    if (row.length > 0) {",
          "      for (const cell of row) {",
          "        if (cell > 0) {",
          "          if (cell > 100) { report(cell); }",
          "        }",
          "      }",
          "    }",
          "  }",
          "}",
        ].join("\n"),
      },
      onTestFinished,
    );

    const result = functionComplexity.run(index);

    expect(result.metric).toBe(100);
    expect(result.findings[0]?.message).toMatch(/nests \d+ deep/);
  });

  it("does not treat an else-if chain as nesting", async () => {
    const branches = Array.from(
      { length: 30 },
      (_, i) => `  ${i === 0 ? "if" : "else if"} (n === ${i}) { return ${i}; }`,
    ).join("\n");

    const index = await indexFixture(
      { "src/a.ts": `export function dispatch(n: number) {\n${branches}\n  return -1;\n}` },
      onTestFinished,
    );

    const fn = index.functions.find((f) => f.name === "dispatch")!;

    expect(fn.maxDepth).toBe(1);
    expect(fn.complexity).toBeGreaterThan(20); // Still branchy, just not deep.
  });

  it("counts genuine nesting", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": [
          "export function nested(rows: number[][]) {",
          "  for (const row of rows) {",
          "    if (row.length) {",
          "      for (const cell of row) {",
          "        if (cell) { report(cell); }",
          "      }",
          "    }",
          "  }",
          "}",
        ].join("\n"),
      },
      onTestFinished,
    );

    expect(index.functions.find((f) => f.name === "nested")!.maxDepth).toBe(4);
  });

  it("attributes a nested helper's branches to the helper, not its parent", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": [
          "export function outer() {",
          "  const inner = (n: number) => {",
          "    if (n > 1) { if (n > 2) { if (n > 3) { return 3; } } }",
          "    return 0;",
          "  };",
          "  return inner(5);",
          "}",
        ].join("\n"),
      },
      onTestFinished,
    );

    const outer = index.functions.find((fn) => fn.name === "outer")!;

    expect(outer.complexity).toBe(1);
    expect(outer.maxDepth).toBe(0);
  });
});

describe("dead-exports — reference forms", () => {
  it("treats a type used only in an annotation as alive", async () => {
    const index = await indexFixture(
      {
        "src/types.ts": "export type Finding = { message: string };",
        "src/use.ts": "import type { Finding } from './types.js';\nexport function a(f: Finding) { return f; }",
      },
      onTestFinished,
    );

    expect(deadExports.run(index).findings.map((f) => f.symbol)).not.toContain("Finding");
  });

  it("treats a type used in an annotation inside its own module as alive", async () => {
    const index = await indexFixture(
      {
        "src/types.ts": [
          "export type Finding = { message: string };",
          "export type Result = { findings: Finding[] };",
        ].join("\n"),
        "src/use.ts": "import type { Result } from './types.js';\nexport function a(r: Result) { return r; }",
      },
      onTestFinished,
    );

    expect(deadExports.run(index).findings.map((f) => f.symbol)).not.toContain("Finding");
  });

  it("still flags a type nothing mentions at all", async () => {
    const index = await indexFixture(
      {
        "src/types.ts": "export type Orphaned = { message: string };",
        "src/use.ts": "export function a() { return 1; }",
      },
      onTestFinished,
    );

    expect(deadExports.run(index).findings.map((f) => f.symbol)).toContain("Orphaned");
  });
});

describe("symbol-collision — interface methods", () => {
  it("does not punish many classes implementing the same method name", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": "export class A { run() { return 1; } }",
        "src/b.ts": "export class B { run() { return 2; } }",
        "src/c.ts": "export class C { run() { return 3; } }",
      },
      onTestFinished,
    );

    expect(symbolCollision.run(index).metric).toBe(0);
  });

  it("still punishes duplicated top-level function names", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": "export function run() { return 1; }",
        "src/b.ts": "export function run() { return 2; }",
      },
      onTestFinished,
    );

    expect(symbolCollision.run(index).metric).toBe(100);
  });
});
