import { DEFAULT_LCOV_PATH, readLcov } from "../../src/discover/lcov.js";
import { walk } from "../../src/discover/walk.js";
import { buildIndex } from "../../src/index/build.js";
import type { CodeIndex } from "../../src/index/types.js";
import { makeTmpRepo } from "./tmp-repo.js";

/**
 * Writes a throwaway repo, walks it, and indexes it.
 *
 * Picks up `coverage/lcov.info` if the fixture writes one, exactly as the CLI
 * does, so coverage-dependent metrics are exercised through the same path.
 */
export async function indexFixture(
  files: Record<string, string>,
  onCleanup: (fn: () => Promise<void>) => void
): Promise<CodeIndex> {
  const root = await makeTmpRepo(files, onCleanup);
  const coverage = await readLcov(root, DEFAULT_LCOV_PATH);
  return await buildIndex(root, await walk(root), coverage);
}

/** `name:kind` pairs for every symbol, in source order per file. */
export function symbolSummary(index: CodeIndex): string[] {
  return [...index.symbols.values()]
    .toSorted(
      (a, b) => a.file.localeCompare(b.file) || a.startIndex - b.startIndex
    )
    .map(
      (s) => `${s.file}:${s.name}:${s.kind}${s.exported ? ":exported" : ""}`
    );
}
