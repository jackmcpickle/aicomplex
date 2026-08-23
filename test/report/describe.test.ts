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
    definitions: 9,
    file: "src/a.ts",
    files: 7,
    kind: "ambiguous-name",
    name: "validate",
    symbol: "validate",
    weight: 9,
  },
  barrel: {
    chain: 3,
    file: "src/lib/index.ts",
    kind: "barrel",
    uses: 12,
    weight: 36,
  },
  "coverage-missing": { kind: "coverage-missing", weight: 1 },
  "crap-bands": {
    functions: 210,
    kind: "crap-bands",
    over15: 12.2,
    over30: 4.8,
    over5: 31.4,
    weight: Number.MAX_SAFE_INTEGER,
  },
  "crap-function": {
    complexity: 11,
    coverage: 40,
    crap: 37.1,
    file: "src/a.ts",
    kind: "crap-function",
    line: 12,
    symbol: "parse",
    weight: 37.1,
  },
  cycle: {
    file: "src/a.ts",
    kind: "cycle",
    members: ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"],
    weight: 5,
  },
  "dead-export": {
    definition: "function",
    file: "src/a.ts",
    kind: "dead-export",
    line: 2,
    symbol: "unusedThing",
    weight: 3,
  },
  "duplicate-body": {
    copies: 4,
    file: "src/a.ts",
    files: 3,
    kind: "duplicate-body",
    line: 3,
    lines: 18,
    names: ["toRow", "toCell", "toCol", "toSpan"],
    weight: 72,
  },
  "hard-function": {
    complexity: 21,
    file: "src/x.ts",
    kind: "hard-function",
    line: 10,
    lines: 140,
    maxDepth: 5,
    symbol: "dispatch",
    weight: 36,
  },
  "large-file": {
    bytes: 70_000,
    file: "src/big.ts",
    kind: "large-file",
    loc: 1800,
    weight: 1800,
  },
  "masked-errors": {
    count: 6,
    file: "src/a.ts",
    kind: "masked-errors",
    line: 4,
    smell: "empty-catch",
    weight: 6,
  },
  orphan: { file: "src/leftover.ts", kind: "orphan", loc: 42, weight: 42 },
  reimplemented: {
    alsoDefinedIn: 2,
    file: "src/main.ts",
    kind: "reimplemented",
    names: ["format", "parse", "slug", "trim"],
    weight: 4,
  },
  "worst-masking-file": {
    count: 11,
    file: "src/noisy.ts",
    kind: "worst-masking-file",
    line: 1,
    weight: 11,
  },
};

describe(renderFinding, () => {
  it.each(Object.entries(SAMPLES))(
    "renders %s as one non-empty line",
    (_kind, finding) => {
      const line = renderFinding(finding);

      expect(line.trim()).not.toBe("");
      expect(line).not.toContain("\n");
      expect(line).not.toContain("undefined");
    }
  );

  it("names the symbol and both numbers for an ambiguous name", () => {
    expect(renderFinding(SAMPLES["ambiguous-name"])).toBe(
      '"validate" is defined 9 times across 7 files'
    );
  });

  it("mentions the chain only when a barrel forwards to another", () => {
    expect(renderFinding(SAMPLES.barrel)).toContain("3 re-exports deep");
    const single: Finding = {
      chain: 1,
      file: "src/lib/index.ts",
      kind: "barrel",
      uses: 12,
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
    expect(renderFinding(SAMPLES["large-file"])).toContain(
      "20.0k tokens to read"
    );
  });
});
