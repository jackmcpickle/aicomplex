import { readFile } from "node:fs/promises";
import path from "node:path";

/** Line number → times executed. Only lines the coverage tool instrumented. */
export type LineHits = Map<number, number>;

/** File path, relative to the scan root → its line hits. */
export type Coverage = Map<string, LineHits>;

/** Where coverage tools put lcov by default. */
export const DEFAULT_LCOV_PATH = "coverage/lcov.info";

/**
 * Reads an lcov report, keyed to paths inside the scan.
 *
 * Only `SF` and `DA` records matter here. `FN`/`FNDA` give per-function hit
 * counts, but they record whether a function was *entered*, not how much of it
 * ran — CRAP needs the latter, so line hits within the function's span are the
 * honest source.
 *
 * Returns null when there is no readable lcov file. That is a normal state,
 * not an error: aicc is usually pointed at a checkout nobody has run tests in.
 */
export async function readLcov(root: string, lcovPath: string): Promise<Coverage | null> {
  const absRoot = path.resolve(root);
  const absLcov = path.resolve(absRoot, lcovPath);

  let contents: string;
  try {
    contents = await readFile(absLcov, "utf8");
  } catch {
    return null;
  }

  const coverage: Coverage = new Map();
  let current: LineHits | null = null;

  for (const raw of contents.split("\n")) {
    const line = raw.trim();

    if (line.startsWith("SF:")) {
      const file = toScanPath(absRoot, absLcov, line.slice(3));
      current = coverage.get(file) ?? new Map();
      coverage.set(file, current);
      continue;
    }

    if (line === "end_of_record") {
      current = null;
      continue;
    }

    if (!current || !line.startsWith("DA:")) continue;

    const [lineNo, hits] = line.slice(3).split(",");
    const n = Number(lineNo);
    const h = Number(hits);
    if (!Number.isFinite(n) || !Number.isFinite(h)) continue;

    // A line can appear more than once across merged reports; keep the best.
    current.set(n, Math.max(current.get(n) ?? 0, h));
  }

  return coverage.size > 0 ? coverage : null;
}

/**
 * Turns an `SF:` path into a path inside the scan.
 *
 * lcov files carry absolute paths, paths relative to wherever the test runner
 * ran, or occasionally paths relative to the report itself. Resolving against
 * the report's own directory first covers the common monorepo case where
 * `packages/x/coverage/lcov.info` names `src/y.ts` meaning
 * `packages/x/src/y.ts`.
 */
function toScanPath(absRoot: string, absLcov: string, raw: string): string {
  const candidates = path.isAbsolute(raw)
    ? [raw]
    : [path.resolve(path.dirname(path.dirname(absLcov)), raw), path.resolve(absRoot, raw)];

  for (const candidate of candidates) {
    const relative = path.relative(absRoot, candidate);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
      return relative.split(path.sep).join("/");
    }
  }

  return raw.split(path.sep).join("/");
}

/**
 * Line coverage across a span, as a percentage.
 *
 * Null when the coverage tool instrumented nothing in that range — a function
 * body of pure declarations, or a file the report does not mention. Null means
 * "unknown", which is different from zero and must not be scored as if it
 * were.
 */
export function coverageOfSpan(
  hits: LineHits | undefined,
  startLine: number,
  endLine: number,
): number | null {
  if (!hits) return null;

  let instrumented = 0;
  let covered = 0;

  for (const [line, count] of hits) {
    if (line < startLine || line > endLine) continue;
    instrumented++;
    if (count > 0) covered++;
  }

  return instrumented === 0 ? null : (covered / instrumented) * 100;
}
