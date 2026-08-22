import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { DiscoveredFile } from "../discover/walk.js";
import { getLanguage } from "../parse/parser.js";
import { collectCalls } from "./collect/calls.js";
import { collectFunctions } from "./collect/functions.js";
import { collectImports } from "./collect/imports.js";
import { countIdentifiers } from "./collect/references.js";
import { collectSmells } from "./collect/smells.js";
import { collectExportedNames, collectSymbols } from "./collect/symbols.js";
import type { CodeIndex, FileNode } from "./types.js";

/**
 * Turns discovered files into the single artifact every analyzer reads.
 *
 * Nothing downstream of this function touches the filesystem or a parser, so
 * analyzers stay pure and testable against a hand-built index. Each collector
 * lives in `./collect` and owns exactly one kind of fact.
 */
export async function buildIndex(root: string, files: DiscoveredFile[]): Promise<CodeIndex> {
  const index: CodeIndex = {
    root,
    files: new Map(),
    symbols: new Map(),
    symbolsByName: new Map(),
    identifierCounts: new Map(),
    imports: [],
    calls: [],
    functions: [],
    smells: [],
    failures: [],
  };

  const knownFiles = new Set(files.map((file) => file.path));

  for (const file of files) {
    try {
      await indexFile(index, file, knownFiles);
    } catch (error) {
      index.failures.push({
        path: file.path,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const symbol of index.symbols.values()) {
    const bucket = index.symbolsByName.get(symbol.name);
    if (bucket) bucket.push(symbol.id);
    else index.symbolsByName.set(symbol.name, [symbol.id]);
  }

  return index;
}

async function indexFile(
  index: CodeIndex,
  file: DiscoveredFile,
  knownFiles: ReadonlySet<string>,
): Promise<void> {
  const source = await readFile(file.absPath, "utf8");
  const compiled = await getLanguage(file.language);

  const tree = compiled.parser.parse(source);
  if (!tree) throw new Error("tree-sitter returned no tree");

  try {
    index.files.set(file.path, toFileNode(file, source));

    const exported = collectExportedNames(compiled, tree);
    const symbols = collectSymbols(compiled, tree, file.path, file.language, exported);
    for (const symbol of symbols) index.symbols.set(symbol.id, symbol);

    index.imports.push(...collectImports(compiled, tree, file, knownFiles));
    index.calls.push(...collectCalls(compiled, tree, file.path, symbols));
    index.functions.push(...collectFunctions(compiled.pack, tree, file.path, symbols));
    index.smells.push(...collectSmells(compiled, tree, file.path));
    countIdentifiers(compiled, tree, index.identifierCounts);
  } finally {
    tree.delete();
  }
}

function toFileNode(file: DiscoveredFile, source: string): FileNode {
  const lines = source.split("\n");
  return {
    path: file.path,
    language: file.language,
    bytes: file.bytes,
    lines: lines.length,
    loc: lines.filter((line) => line.trim() !== "").length,
    role: file.role,
    hash: createHash("sha256").update(source).digest("hex"),
  };
}
