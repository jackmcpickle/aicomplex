import { describe, expect, it } from "vitest";
import { LANGUAGES } from "../../src/discover/detect.js";
import { getLanguage } from "../../src/parse/parser.js";

/**
 * A query that names a node type its grammar does not have compiles to
 * nothing, which would make every downstream metric silently report zero.
 * These tests are the guard against that.
 */
describe("language packs", () => {
  it.each(LANGUAGES)("compiles every query for %s", async (language) => {
    const compiled = await getLanguage(language);

    expect(compiled.pack.language).toBe(language);
    expect(compiled.queries.definitions.captureNames).toContain("name");
    expect(compiled.queries.calls.captureNames).toContain("call.name");
  });

  it.each([
    ["typescript", "export const add = (a: number): number => a + 1;"],
    ["tsx", "export const App = () => <div>hi</div>;"],
    ["javascript", "export function add(a) { return a + 1; }"],
    ["python", "def add(a):\n    return a + 1\n"],
    ["go", "package main\n\nfunc Add(a int) int { return a + 1 }\n"],
  ] as const)("parses %s without error nodes", async (language, source) => {
    const { parser } = await getLanguage(language);
    const tree = parser.parse(source);

    expect(tree).not.toBeNull();
    expect(tree!.rootNode.hasError).toBe(false);

    tree?.delete();
  });

  it("caches the compiled language across calls", async () => {
    const [first, second] = await Promise.all([getLanguage("go"), getLanguage("go")]);
    expect(first).toBe(second);
  });
});
