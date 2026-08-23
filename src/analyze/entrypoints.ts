/**
 * Files that are plausibly a root, rather than something reached by an import.
 *
 * This matters twice. An entrypoint being unimported is its job, not a defect.
 * And an entrypoint's exports are public API — a library exists precisely so
 * that nothing inside it calls its own surface, so treating those exports as
 * dead would condemn every well-built library.
 */
const ENTRYPOINT_NAMES = new Set([
  "index",
  "main",
  "cli",
  "app",
  "server",
  "worker",
  "setup",
  "public-api",
  "__init__",
  "__main__",
]);

export function isLikelyEntrypoint(filePath: string): boolean {
  const segments = filePath.split("/");
  const filename = segments.at(-1);
  if (filename === undefined) {
    return false;
  }
  const stem = filename.slice(0, filename.lastIndexOf(".")) || filename;

  if (ENTRYPOINT_NAMES.has(stem)) {
    return true;
  }
  if (segments.length === 1) {
    return true;
  } // Sitting at the repo root.

  return false;
}
