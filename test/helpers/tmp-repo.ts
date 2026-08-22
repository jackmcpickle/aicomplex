import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Creates a throwaway directory populated from a `{ relativePath: contents }`
 * map, and registers its cleanup with the caller's `onCleanup` hook.
 */
export async function makeTmpRepo(
  files: Record<string, string>,
  onCleanup: (fn: () => Promise<void>) => void,
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "aicc-test-"));
  onCleanup(() => rm(root, { recursive: true, force: true }));

  for (const [relative, contents] of Object.entries(files)) {
    const absPath = path.join(root, relative);
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, contents, "utf8");
  }

  return root;
}
