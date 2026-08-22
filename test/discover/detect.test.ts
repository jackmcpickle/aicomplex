import { describe, expect, it } from "vitest";
import { detectLanguage } from "../../src/discover/detect.js";

describe("detectLanguage", () => {
  it.each([
    ["src/index.ts", "typescript"],
    ["src/App.tsx", "tsx"],
    ["src/legacy.jsx", "tsx"],
    ["scripts/build.mjs", "javascript"],
    ["scripts/build.cjs", "javascript"],
    ["app/main.py", "python"],
    ["cmd/root.go", "go"],
    ["src/Index.TS", "typescript"],
  ])("maps %s to %s", (filePath, expected) => {
    expect(detectLanguage(filePath)).toBe(expected);
  });

  it.each(["README.md", "Makefile", "styles.css", ".gitignore", "noextension"])(
    "returns null for %s",
    (filePath) => {
      expect(detectLanguage(filePath)).toBeNull();
    },
  );
});
