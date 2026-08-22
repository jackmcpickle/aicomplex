import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import ignore, { type Ignore } from "ignore";
import { glob } from "tinyglobby";
import { detectLanguage, SUPPORTED_EXTENSIONS, type Language } from "./detect.js";

export type DiscoveredFile = {
  /** Path relative to the scan root, always posix-separated. */
  path: string;
  absPath: string;
  language: Language;
  bytes: number;
  /** True when the file looks like a test rather than shipped source. */
  isTest: boolean;
};

export type WalkOptions = {
  /** Extra glob patterns to exclude, on top of .gitignore and the defaults. */
  exclude?: string[];
  /** Skip .gitignore parsing. Mostly useful in tests. */
  respectGitignore?: boolean;
  /** Files larger than this are skipped — they are generated, not written. */
  maxFileBytes?: number;
};

/**
 * Directories and files that are never source code worth scoring. These are
 * excluded before .gitignore is even consulted, because a repo that commits
 * its `vendor/` directory should not be punished for it.
 */
const ALWAYS_EXCLUDE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/coverage/**",
  "**/vendor/**",
  "**/venv/**",
  "**/.venv/**",
  "**/__pycache__/**",
  "**/site-packages/**",
  "**/.mypy_cache/**",
  "**/*.min.js",
  "**/*.bundle.js",
  "**/*.d.ts",
  "**/*_pb.go",
  "**/*.pb.go",
  "**/*_generated.*",
  "**/*.generated.*",
];

const TEST_PATTERN =
  /(^|[./_-])(tests?|__tests__|spec|specs|e2e|fixtures?)([./_-]|$)|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|[^/]+_test\.(py|go)$/i;

/** 2 MB. Anything bigger is a data blob or generated artifact. */
const DEFAULT_MAX_FILE_BYTES = 2_000_000;

/**
 * Finds every parseable source file under `root`.
 *
 * Ordering is stable (sorted by path) so that downstream scores and report
 * snapshots do not depend on filesystem iteration order.
 */
export async function walk(root: string, options: WalkOptions = {}): Promise<DiscoveredFile[]> {
  const {
    exclude = [],
    respectGitignore = true,
    maxFileBytes = DEFAULT_MAX_FILE_BYTES,
  } = options;

  const absRoot = path.resolve(root);
  const patterns = SUPPORTED_EXTENSIONS.map((ext) => `**/*${ext}`);

  const candidates = await glob(patterns, {
    cwd: absRoot,
    absolute: false,
    dot: false,
    followSymbolicLinks: false,
    ignore: [...ALWAYS_EXCLUDE, ...exclude],
  });

  const matcher = respectGitignore ? await loadGitignores(absRoot, candidates) : null;

  const files: DiscoveredFile[] = [];
  for (const relative of candidates) {
    const posixPath = toPosix(relative);
    if (matcher?.ignores(posixPath)) continue;

    const language = detectLanguage(posixPath);
    if (!language) continue;

    const absPath = path.join(absRoot, relative);
    const bytes = await sizeOf(absPath);
    if (bytes === null || bytes > maxFileBytes) continue;

    files.push({
      path: posixPath,
      absPath,
      language,
      bytes,
      isTest: TEST_PATTERN.test(posixPath),
    });
  }

  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Builds a single matcher from every .gitignore that could affect the
 * candidate files.
 *
 * Nested .gitignore rules are scoped to their own directory, so each rule is
 * re-anchored to the scan root before being added. This is a close-enough
 * approximation of git's semantics: it handles the common `src/.gitignore`
 * case correctly and errs toward including files when unsure, which is the
 * safe direction for a scoring tool.
 */
async function loadGitignores(absRoot: string, candidates: string[]): Promise<Ignore | null> {
  const dirs = new Set<string>([""]);
  for (const candidate of candidates) {
    const segments = toPosix(candidate).split("/").slice(0, -1);
    for (let i = 1; i <= segments.length; i++) {
      dirs.add(segments.slice(0, i).join("/"));
    }
  }

  const matcher = ignore();
  let found = false;

  for (const dir of [...dirs].sort()) {
    const gitignorePath = path.join(absRoot, dir, ".gitignore");
    let contents: string;
    try {
      contents = await readFile(gitignorePath, "utf8");
    } catch {
      continue;
    }
    found = true;
    matcher.add(dir === "" ? contents : rescope(contents, dir));
  }

  return found ? matcher : null;
}

/** Re-anchors the rules of a nested .gitignore relative to the scan root. */
function rescope(contents: string, dir: string): string {
  return contents
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) return "";

      const negated = trimmed.startsWith("!");
      const pattern = negated ? trimmed.slice(1) : trimmed;
      const anchored = pattern.startsWith("/")
        ? `${dir}${pattern}`
        : `${dir}/**/${pattern}`;

      return `${negated ? "!" : ""}${anchored}`;
    })
    .filter(Boolean)
    .join("\n");
}

async function sizeOf(absPath: string): Promise<number | null> {
  try {
    const stats = await stat(absPath);
    return stats.isFile() ? stats.size : null;
  } catch {
    return null;
  }
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}
