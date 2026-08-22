import { buildIndex } from "../../src/index/build.js";
import { walk } from "../../src/discover/walk.js";
import type { CodeIndex } from "../../src/index/types.js";
import { makeTmpRepo } from "./tmp-repo.js";

/** Writes a throwaway repo, walks it, and indexes it. */
export async function indexFixture(
  files: Record<string, string>,
  onCleanup: (fn: () => Promise<void>) => void,
): Promise<CodeIndex> {
  const root = await makeTmpRepo(files, onCleanup);
  return buildIndex(root, await walk(root));
}

/** `name:kind` pairs for every symbol, in source order per file. */
export function symbolSummary(index: CodeIndex): string[] {
  return [...index.symbols.values()]
    .sort((a, b) => a.file.localeCompare(b.file) || a.startIndex - b.startIndex)
    .map((s) => `${s.file}:${s.name}:${s.kind}${s.exported ? ":exported" : ""}`);
}
