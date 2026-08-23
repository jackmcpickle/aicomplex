import { describe, expect, it } from "vitest";

import { detectRole } from "../../src/discover/role.js";

describe(detectRole, () => {
  it.each([
    ["src/index.ts", "source"],
    ["packages/zod/src/v4/core/schemas.ts", "source"],
    ["app/services/billing.py", "source"],
    ["cmd/server/main.go", "source"],
  ])("treats %s as %s", (filePath, expected) => {
    expect(detectRole(filePath)).toBe(expected);
  });

  it.each([
    ["src/index.test.ts", "test"],
    ["test/e2e/login.spec.ts", "test"],
    ["src/__tests__/thing.ts", "test"],
    ["app/test_main.py", "test"],
    ["cmd/root_test.go", "test"],
    ["app/conftest.py", "test"],
    ["test/fixtures/sample.ts", "test"],
    ["src/__mocks__/api.ts", "test"],
  ])("treats %s as %s", (filePath, expected) => {
    expect(detectRole(filePath)).toBe(expected);
  });

  it.each([
    ["packages/bench/compile-matrix.ts", "benchmark"],
    ["benchmarks/parse.ts", "benchmark"],
    ["src/parse.bench.ts", "benchmark"],
    ["perf/load.py", "benchmark"],
  ])("treats %s as %s", (filePath, expected) => {
    expect(detectRole(filePath)).toBe(expected);
  });

  it.each([
    ["examples/basic.ts", "example"],
    ["demo/app.tsx", "example"],
    ["playground/scratch.ts", "example"],
  ])("treats %s as %s", (filePath, expected) => {
    expect(detectRole(filePath)).toBe(expected);
  });

  it.each([
    ["packages/docs/components/ecosystem.tsx", "docs"],
    ["website/src/page.tsx", "docs"],
  ])("treats %s as %s", (filePath, expected) => {
    expect(detectRole(filePath)).toBe(expected);
  });

  it.each([
    ["scripts/seed.ts", "script"],
    ["bin/release.ts", "script"],
    ["tools/codegen.py", "script"],
    ["migrations/001_init.py", "script"],
    ["vite.config.ts", "script"],
    ["tailwind.config.js", "script"],
  ])("treats %s as %s", (filePath, expected) => {
    expect(detectRole(filePath)).toBe(expected);
  });

  it("prefers test over benchmark for a benchmark's own tests", () => {
    expect(detectRole("bench/parse.test.ts")).toBe("test");
  });

  it("does not misread a source file whose name merely contains a keyword", () => {
    expect(detectRole("src/documentation.ts")).toBe("source");
    expect(detectRole("src/benchmarking-utils.ts")).toBe("source");
    expect(detectRole("src/testing.ts")).toBe("source");
  });
});
