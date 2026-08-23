/**
 * What a file is *for*.
 *
 * Only `source` is scored. Benchmarks legitimately repeat the same names in
 * every file, examples are meant to stand alone, and scripts are meant to be
 * unimported — judging them produces confident nonsense. Scanning zod without
 * this made half its files look orphaned and half its names look ambiguous,
 * when almost all of it was `packages/bench` and `packages/docs`.
 */

export const FILE_ROLES = [
  "source",
  "test",
  "benchmark",
  "example",
  "script",
  "docs",
] as const;

export type FileRole = (typeof FILE_ROLES)[number];

/** Roles that carry the codebase's actual behaviour, and so get scored. */
export const SCORED_ROLES: ReadonlySet<FileRole> = new Set<FileRole>([
  "source",
]);

const TEST =
  /(^|\/)(tests?|__tests__|specs?|e2e|fixtures?|testdata|mocks?|__mocks__)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|[^/]+_test\.(py|go)$|(^|\/)conftest\.py$/iu;

const BENCHMARK =
  /(^|\/)(bench|benches|benchmark|benchmarks|perf|performance)(\/|$)|\.bench\.[cm]?[jt]sx?$/iu;

const EXAMPLE =
  /(^|\/)(examples?|demos?|samples?|playground|sandbox|templates?|scaffold)(\/|$)/iu;

const DOCS = /(^|\/)(docs?|documentation|website|www)(\/|$)/iu;

const SCRIPT =
  /(^|\/)(scripts?|bin|tools?|tooling|migrations?|codegen|build)(\/|$)|(^|\/)[^/]*\.config\.[cm]?[jt]s$|(^|\/)(gulpfile|webpack|rollup|vite|vitest|jest|eslint|prettier|tailwind)[^/]*\.[cm]?[jt]s$/iu;

/**
 * Classifies a path by role.
 *
 * Order is deliberate: a benchmark's own test file is a test first, and a
 * config file inside `docs/` is documentation tooling rather than build
 * tooling for the product.
 */
export function detectRole(filePath: string): FileRole {
  if (TEST.test(filePath)) {
    return "test";
  }
  if (BENCHMARK.test(filePath)) {
    return "benchmark";
  }
  if (EXAMPLE.test(filePath)) {
    return "example";
  }
  if (DOCS.test(filePath)) {
    return "docs";
  }
  if (SCRIPT.test(filePath)) {
    return "script";
  }
  return "source";
}
