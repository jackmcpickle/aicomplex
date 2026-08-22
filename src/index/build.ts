import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Node, QueryMatch, Tree } from "web-tree-sitter";
import type { DiscoveredFile } from "../discover/walk.js";
import type { Language } from "../discover/detect.js";
import {
  isDefinitionKind,
  moreSpecificKind,
  type DefinitionKind,
} from "../parse/language-pack.js";
import { getLanguage, type CompiledLanguage } from "../parse/parser.js";
import { resolveImport } from "./resolve.js";
import type {
  CallEdge,
  CodeIndex,
  FileNode,
  ImportEdge,
  ImportKind,
  SymbolNode,
} from "./types.js";

/**
 * Turns discovered files into the single artifact every analyzer reads.
 *
 * Nothing downstream of this function touches the filesystem or a parser, so
 * analyzers stay pure and testable against a hand-built index.
 */
export async function buildIndex(root: string, files: DiscoveredFile[]): Promise<CodeIndex> {
  const index: CodeIndex = {
    root,
    files: new Map(),
    symbols: new Map(),
    symbolsByName: new Map(),
    imports: [],
    calls: [],
    failures: [],
  };

  const knownFiles = new Set(files.map((f) => f.path));

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

    const exportedNames = collectExportedNames(compiled, tree, file.language);
    const symbols = collectSymbols(compiled, tree, file.path, file.language, exportedNames);
    for (const symbol of symbols) index.symbols.set(symbol.id, symbol);

    index.imports.push(...collectImports(compiled, tree, file, knownFiles));
    index.calls.push(...collectCalls(compiled, tree, file.path, symbols));
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
    isTest: file.isTest,
    hash: createHash("sha256").update(source).digest("hex"),
  };
}

// ---------------------------------------------------------------- definitions

function collectSymbols(
  compiled: CompiledLanguage,
  tree: Tree,
  filePath: string,
  language: Language,
  exportedNames: ExportedNames,
): SymbolNode[] {
  /** Keyed by node span so two patterns matching one node produce one symbol. */
  const byNode = new Map<string, SymbolNode>();

  for (const match of compiled.queries.definitions.matches(tree.rootNode)) {
    const parsed = readDefinition(match);
    if (!parsed) continue;

    const { kind, nameNode, definitionNode } = parsed;
    const key = `${definitionNode.startIndex}:${definitionNode.endIndex}`;
    const existing = byNode.get(key);

    if (existing) {
      existing.kind = moreSpecificKind(existing.kind, kind);
      continue;
    }

    const name = nameNode.text;
    byNode.set(key, {
      id: `${filePath}#${name}@${definitionNode.startIndex}`,
      name,
      kind,
      file: filePath,
      startLine: definitionNode.startPosition.row + 1,
      endLine: definitionNode.endPosition.row + 1,
      startIndex: definitionNode.startIndex,
      endIndex: definitionNode.endIndex,
      exported: isExported(name, language, exportedNames),
    });
  }

  return [...byNode.values()].sort((a, b) => a.startIndex - b.startIndex);
}

function readDefinition(
  match: QueryMatch,
): { kind: DefinitionKind; nameNode: Node; definitionNode: Node } | null {
  let nameNode: Node | null = null;
  let definitionNode: Node | null = null;
  let kind: DefinitionKind | null = null;

  for (const capture of match.captures) {
    if (capture.name === "name") {
      nameNode = capture.node;
      continue;
    }
    const [prefix, rawKind] = splitCaptureName(capture.name);
    if (prefix === "definition" && rawKind && isDefinitionKind(rawKind)) {
      kind = rawKind;
      definitionNode = capture.node;
    }
  }

  if (!nameNode || !definitionNode || !kind) return null;
  return { kind, nameNode, definitionNode };
}

// -------------------------------------------------------------------- exports

type ExportedNames = { explicit: Set<string>; hasExplicitList: boolean };

function collectExportedNames(
  compiled: CompiledLanguage,
  tree: Tree,
  language: Language,
): ExportedNames {
  const explicit = new Set<string>();
  let hasExplicitList = false;

  for (const match of compiled.queries.exports.matches(tree.rootNode)) {
    for (const capture of match.captures) {
      if (capture.name === "export.name") {
        explicit.add(capture.node.text);
        hasExplicitList = true;
      } else if (capture.name === "export.all") {
        hasExplicitList = true;
      }
    }
  }

  // Python's `__all__` is an explicit allow-list; without one, the underscore
  // convention applies. Go never has a list — capitalisation decides.
  if (language === "python" && !hasExplicitList) return { explicit, hasExplicitList: false };
  return { explicit, hasExplicitList };
}

function isExported(name: string, language: Language, exported: ExportedNames): boolean {
  if (language === "go") return /^[A-Z]/.test(name);
  if (language === "python") {
    return exported.hasExplicitList ? exported.explicit.has(name) : !name.startsWith("_");
  }
  return exported.explicit.has(name);
}

// -------------------------------------------------------------------- imports

function collectImports(
  compiled: CompiledLanguage,
  tree: Tree,
  file: DiscoveredFile,
  knownFiles: ReadonlySet<string>,
): ImportEdge[] {
  const matches = compiled.queries.imports.matches(tree.rootNode);

  /** Import statement node span → the edge being assembled for it. */
  const edges = new Map<string, ImportEdge>();
  const statementSpans: { key: string; start: number; end: number }[] = [];

  for (const match of matches) {
    const sourceNode = match.captures.find((c) => c.name === "import.source")?.node;
    if (!sourceNode) continue;

    const statement = match.captures.find((c) => c.name.startsWith("import."))?.node;
    const kindCapture = match.captures.find(
      (c) => c.name.startsWith("import.") && c.name !== "import.source" && c.name !== "import.name",
    );
    const statementNode = kindCapture?.node ?? statement ?? sourceNode;
    const key = `${statementNode.startIndex}:${statementNode.endIndex}`;
    if (edges.has(key)) continue;

    const kind = (splitCaptureName(kindCapture?.name ?? "import.static")[1] ?? "static") as ImportKind;
    const source = stripQuotes(sourceNode.text);

    edges.set(key, {
      from: file.path,
      source,
      resolved: resolveImport(file.path, source, file.language, knownFiles),
      names: [],
      kind,
      line: statementNode.startPosition.row + 1,
    });
    statementSpans.push({ key, start: statementNode.startIndex, end: statementNode.endIndex });
  }

  // Second pass: attach each imported binding to the statement enclosing it.
  for (const match of matches) {
    for (const capture of match.captures) {
      if (capture.name !== "import.name") continue;
      const owner = statementSpans.find(
        (span) => capture.node.startIndex >= span.start && capture.node.endIndex <= span.end,
      );
      const edge = owner ? edges.get(owner.key) : undefined;
      if (edge && !edge.names.includes(capture.node.text)) edge.names.push(capture.node.text);
    }
  }

  return [...edges.values()].sort((a, b) => a.line - b.line);
}

// ---------------------------------------------------------------------- calls

function collectCalls(
  compiled: CompiledLanguage,
  tree: Tree,
  filePath: string,
  symbols: SymbolNode[],
): CallEdge[] {
  const calls: CallEdge[] = [];

  for (const capture of compiled.queries.calls.captures(tree.rootNode)) {
    if (capture.name !== "call.name") continue;

    calls.push({
      from: filePath,
      fromSymbol: enclosingSymbol(symbols, capture.node.startIndex)?.id ?? null,
      name: capture.node.text,
      line: capture.node.startPosition.row + 1,
    });
  }

  return calls;
}

/** The tightest-spanning symbol containing `offset`, so nested functions win. */
function enclosingSymbol(symbols: SymbolNode[], offset: number): SymbolNode | undefined {
  let best: SymbolNode | undefined;
  for (const symbol of symbols) {
    if (symbol.startIndex > offset) break;
    if (offset >= symbol.endIndex) continue;
    if (!best || symbol.endIndex - symbol.startIndex < best.endIndex - best.startIndex) {
      best = symbol;
    }
  }
  return best;
}

// --------------------------------------------------------------------- shared

function splitCaptureName(name: string): [string, string | undefined] {
  const dot = name.indexOf(".");
  return dot === -1 ? [name, undefined] : [name.slice(0, dot), name.slice(dot + 1)];
}

function stripQuotes(text: string): string {
  return text.replace(/^["'`]|["'`]$/g, "");
}
