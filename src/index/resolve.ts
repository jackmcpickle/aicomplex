import path from "node:path";
import type { Language } from "../discover/detect.js";

/**
 * Resolves an import specifier to a file inside the scan.
 *
 * This is deliberately name- and path-based: no tsconfig `paths`, no
 * `node_modules` walking, no Go module graph. A specifier that does not land
 * on a scanned file resolves to null, which is read as "leaves the codebase".
 * That is the honest answer for a tool that only ever sees the scan root.
 */
export function resolveImport(
  fromFile: string,
  specifier: string,
  language: Language,
  knownFiles: ReadonlySet<string>,
): string | null {
  if (language === "python") return resolvePython(fromFile, specifier, knownFiles);
  if (language === "go") return null; // Go imports are module paths, not file paths.
  return resolveJs(fromFile, specifier, knownFiles);
}

const JS_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

function resolveJs(
  fromFile: string,
  specifier: string,
  knownFiles: ReadonlySet<string>,
): string | null {
  if (!specifier.startsWith(".")) return null;

  const base = posixJoin(path.posix.dirname(fromFile), specifier);

  // `./foo.js` in ESM TypeScript usually means `./foo.ts` on disk.
  const withoutExt = base.replace(/\.[cm]?jsx?$/, "");

  for (const candidate of [base, ...JS_EXTENSIONS.flatMap((ext) => [
    `${withoutExt}${ext}`,
    `${withoutExt}/index${ext}`,
  ])]) {
    if (knownFiles.has(candidate)) return candidate;
  }

  return null;
}

function resolvePython(
  fromFile: string,
  specifier: string,
  knownFiles: ReadonlySet<string>,
): string | null {
  const leadingDots = /^\.+/.exec(specifier)?.[0].length ?? 0;

  let baseDir: string;
  let moduleParts: string[];

  if (leadingDots > 0) {
    // One dot is the current package; each extra dot climbs one level.
    baseDir = path.posix.dirname(fromFile);
    for (let i = 1; i < leadingDots; i++) baseDir = path.posix.dirname(baseDir);
    moduleParts = specifier.slice(leadingDots).split(".").filter(Boolean);
  } else {
    baseDir = "";
    moduleParts = specifier.split(".").filter(Boolean);
  }

  const stem = posixJoin(baseDir, moduleParts.join("/"));

  for (const candidate of [`${stem}.py`, `${stem}/__init__.py`]) {
    if (knownFiles.has(candidate)) return candidate;
  }

  return null;
}

function posixJoin(dir: string, rest: string): string {
  const joined = path.posix.normalize(path.posix.join(dir, rest));
  return joined.startsWith("./") ? joined.slice(2) : joined;
}
