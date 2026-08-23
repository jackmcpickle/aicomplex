import { describe, expect, it } from "vitest";
import type { Finding, FindingKind } from "../../src/analyze/findings.js";
import { renderFinding } from "../../src/report/describe.js";

/**
 * One sample per kind, keyed by kind.
 *
 * Typed as a total `Record`, so adding a `Finding` variant without adding a
 * sample here fails to compile — which is how this stays exhaustive rather
 * than becoming whatever someone remembered to add.
 */
const SAMPLES: Record<FindingKind, Finding> = {
  "ambiguous-name": {
    kind: "ambiguous-name",
    name: "validate",
    definitions: 9,
    files: 7,
    file: "src/a.ts",
    symbol: "validate",
    weight: 9,
  },
  orphan: { kind: "orphan", file: "src/leftover.ts", loc: 42, weight: 42 },
  barrel: { kind: "barrel", file: "src/lib/index.ts", uses: 12, chain: 3, weight: 36 },
  cycle: {
    kind: "cycle",
    members: ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"],
    file: "src/a.ts",
    weight: 5,
  },
  reimplemented: {
    kind: "reimplemented",
    file: "src/main.ts",
    names: ["format", "parse", "slug", "trim"],
    alsoDefinedIn: 2,
    weight: 4,
  },
  "large-file": { kind: "large-file", file: "src/big.ts", loc: 1800, bytes: 70_000, weight: 1800 },
  "hard-function": {
    kind: "hard-function",
    file: "src/x.ts",
    line: 10,
    symbol: "dispatch",
    complexity: 21,
    maxDepth: 5,
    lines: 140,
    weight: 36,
  },
  "duplicate-body": {
    kind: "duplicate-body",
    file: "src/a.ts",
    line: 3,
    copies: 4,
    lines: 18,
    files: 3,
    names: ["toRow", "toCell", "toCol", "toSpan"],
    weight: 72,
  },
  "masked-errors": {
    kind: "masked-errors",
    smell: "empty-catch",
    count: 6,
    file: "src/a.ts",
    line: 4,
    weight: 6,
  },
  "worst-masking-file": {
    kind: "worst-masking-file",
    file: "src/noisy.ts",
    count: 11,
    line: 1,
    weight: 11,
  },
  "dead-export": {
    kind: "dead-export",
    file: "src/a.ts",
    line: 2,
    symbol: "unusedThing",
    definition: "function",
    weight: 3,
  },
};

describe("renderFinding", () => {
  it.each(Object.entries(SAMPLES))("renders %s as one non-empty line", (_kind, finding) => {
    const line = renderFinding(finding);

    expect(line.trim()).not.toBe("");
    expect(line).not.toContain("\n");
    expect(line).not.toContain("undefined");
  });

  it("names the symbol and both numbers for an ambiguous name", () => {
    expect(renderFinding(SAMPLES["ambiguous-name"])).toBe(
      '"validate" is defined 9 times across 7 files',
    );
  });

  it("mentions the chain only when a barrel forwards to another", () => {
    expect(renderFinding(SAMPLES.barrel)).toContain("3 re-exports deep");
    const single: Finding = {
      kind: "barrel",
      file: "src/lib/index.ts",
      uses: 12,
      chain: 1,
      weight: 12,
    };
    expect(renderFinding(single)).not.toContain("re-exports deep");
  });

  it("truncates long lists rather than printing all of them", () => {
    expect(renderFinding(SAMPLES.cycle)).toContain("→ …");
    expect(renderFinding(SAMPLES.reimplemented)).toContain("and 1 more");
    expect(renderFinding(SAMPLES["duplicate-body"])).toContain(", …");
  });

  it("estimates tokens for a large file", () => {
    expect(renderFinding(SAMPLES["large-file"])).toContain("20.0k tokens to read");
  });
});
