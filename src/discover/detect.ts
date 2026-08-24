/**
 * Language detection by file extension.
 *
 * v1 supports the three ecosystems where AI-assisted development is most
 * concentrated. Adding a language is one entry here plus a language pack.
 */

export const LANGUAGES = [
  "typescript",
  "tsx",
  "javascript",
  "python",
  "go",
] as const;

export type Language = (typeof LANGUAGES)[number];

const EXTENSION_TO_LANGUAGE: Record<string, Language> = {
  ".cjs": "javascript",
  ".cts": "typescript",
  ".go": "go",
  ".js": "javascript",
  ".jsx": "tsx",
  ".mjs": "javascript",
  ".mts": "typescript",
  ".py": "python",
  ".pyi": "python",
  ".ts": "typescript",
  ".tsx": "tsx",
};

/** Every extension aic3 knows how to parse. Used to build the glob patterns. */
export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_TO_LANGUAGE);

/** Returns the language for a path, or null if aic3 cannot parse it. */
export function detectLanguage(filePath: string): Language | null {
  const dot = filePath.lastIndexOf(".");
  if (dot <= 0) {
    return null;
  }
  return EXTENSION_TO_LANGUAGE[filePath.slice(dot).toLowerCase()] ?? null;
}
