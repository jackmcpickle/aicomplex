/**
 * Language detection by file extension.
 *
 * v1 supports the three ecosystems where AI-assisted development is most
 * concentrated. Adding a language is one entry here plus a language pack.
 */

export const LANGUAGES = ["typescript", "tsx", "javascript", "python", "go"] as const;

export type Language = (typeof LANGUAGES)[number];

const EXTENSION_TO_LANGUAGE: Record<string, Language> = {
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "tsx",
  ".py": "python",
  ".pyi": "python",
  ".go": "go",
};

/** Every extension aicc knows how to parse. Used to build the glob patterns. */
export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_TO_LANGUAGE);

/** Returns the language for a path, or null if aicc cannot parse it. */
export function detectLanguage(filePath: string): Language | null {
  const dot = filePath.lastIndexOf(".");
  if (dot <= 0) return null;
  return EXTENSION_TO_LANGUAGE[filePath.slice(dot).toLowerCase()] ?? null;
}
