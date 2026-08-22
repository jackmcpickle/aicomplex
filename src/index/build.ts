import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Node, QueryMatch, Tree } from "web-tree-sitter";
import type { DiscoveredFile } from "../discover/walk.js";
import type { Language } from "../discover/detect.js";
import {
  isDefinitionKind,
  moreSpecificKind,
  type DefinitionKind,
  type LanguagePack,
  type SmellKind,
} from "../parse/language-pack.js";
import { getLanguage, type CompiledLanguage } from "../parse/parser.js";
import { resolveImport } from "./resolve.js";
import type {
  CallEdge,
  CodeIndex,
  FileNode,
  FunctionNode,
  ImportEdge,
  ImportKind,
  Smell,
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
    functions: [],
    smells: [],
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
    index.functions.push(...collectFunctions(compiled.pack, tree, file.path, symbols));
    index.smells.push(...collectSmells(compiled, tree, file.path));
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

// ------------------------------------------------------------------ functions

/**
 * Measures every function body in the file.
 *
 * One walk collects all of it, because re-walking per metric is where a
 * whole-repo scan starts costing real time.
 */
function collectFunctions(
  pack: LanguagePack,
  tree: Tree,
  filePath: string,
  symbols: SymbolNode[],
): FunctionNode[] {
  const functionNodes = new Set<string>(pack.functionNodes);
  const branchNodes = new Set<string>(pack.branchNodes);
  const nestingNodes = new Set<string>(pack.nestingNodes);
  const functions: FunctionNode[] = [];

  walkTree(tree.rootNode, (node) => {
    if (!functionNodes.has(node.type)) return true;

    const shape: string[] = [];
    let complexity = 1;
    let shapeSize = 0;

    // Depth is measured from this function's own root, so a deeply nested
    // helper is not punished for where it happens to live.
    const maxDepth = measureBody(node, {
      functionNodes,
      branchNodes,
      nestingNodes,
      shape,
      onBranch: () => {
        complexity++;
      },
      onNode: () => {
        shapeSize++;
      },
    });

    const symbol = enclosingSymbol(symbols, node.startIndex);

    functions.push({
      file: filePath,
      symbol: symbol?.id ?? null,
      name: symbol?.name ?? "<anonymous>",
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      lines: node.endPosition.row - node.startPosition.row + 1,
      complexity,
      maxDepth,
      shapeHash: createHash("sha256").update(shape.join(",")).digest("hex").slice(0, 32),
      shapeSize,
    });

    return true; // Keep descending: nested functions are functions too.
  });

  return functions;
}

type BodyWalk = {
  functionNodes: ReadonlySet<string>;
  branchNodes: ReadonlySet<string>;
  nestingNodes: ReadonlySet<string>;
  shape: string[];
  onBranch: () => void;
  onNode: () => void;
};

/**
 * Walks one function body, accumulating its AST shape, branches and depth.
 *
 * Nested function bodies are skipped so their branches and shape belong to
 * them rather than inflating their parent.
 */
function measureBody(root: Node, walk: BodyWalk): number {
  let maxDepth = 0;

  const visit = (node: Node, depth: number): void => {
    for (const child of node.namedChildren) {
      if (!child) continue;

      walk.shape.push(child.type);
      walk.onNode();

      if (walk.functionNodes.has(child.type)) continue; // Belongs to the nested function.

      if (walk.branchNodes.has(child.type)) walk.onBranch();

      const nextDepth =
        walk.nestingNodes.has(child.type) && !isChainedElse(child) ? depth + 1 : depth;

      maxDepth = Math.max(maxDepth, nextDepth);
      visit(child, nextDepth);
    }
  };

  visit(root, 0);
  return maxDepth;
}

/**
 * True for the `if` in an `else if`.
 *
 * Such an `if` is a continuation of the chain, not a level inside it. Without
 * this, a forty-case dispatch written as `else if` reports a depth of forty.
 */
function isChainedElse(node: Node): boolean {
  const parentType = node.parent?.type;
  return parentType === "else_clause" || parentType === "elif_clause";
}

// --------------------------------------------------------------------- smells

function collectSmells(compiled: CompiledLanguage, tree: Tree, filePath: string): Smell[] {
  const smells: Smell[] = [];

  for (const capture of compiled.queries.smells.captures(tree.rootNode)) {
    const [prefix, kind] = splitCaptureName(capture.name);
    if (prefix !== "smell" || !kind) continue;
    if (!validateSmell(kind as SmellKind, capture.node)) continue;

    smells.push({
      file: filePath,
      line: capture.node.startPosition.row + 1,
      kind: kind as SmellKind,
      text: capture.node.text.slice(0, 120).replace(/\s+/g, " ").trim(),
    });
  }

  return smells;
}

const IGNORE_COMMENT =
  /eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck|type:\s*ignore|noqa|nolint|pylint:\s*disable|prettier-ignore|istanbul ignore|c8 ignore/i;

/**
 * Decides whether a captured node is really a smell.
 *
 * The queries cannot express "empty" or "says ignore", so they capture every
 * candidate and the judgement happens here.
 */
function validateSmell(kind: SmellKind, node: Node): boolean {
  switch (kind) {
    case "empty-catch":
      // A catch block with nothing in it discards the error entirely.
      return node.namedChildren.filter((child) => child?.type !== "comment").length === 0;

    case "bare-except": {
      // `except:` or `except Exception:` whose body only passes. The block is
      // a plain named child — except_clause has no `body` field.
      const block = node.namedChildren.find((child) => child?.type === "block");
      const statements = block?.namedChildren.filter((child) => child?.type !== "comment") ?? [];
      return statements.length === 1 && statements[0]?.type === "pass_statement";
    }

    case "ignore-comment":
      return IGNORE_COMMENT.test(node.text);

    case "any-type":
      return node.text === "any";
  }
}

// --------------------------------------------------------------------- shared

/** Pre-order walk. Returning false from `visit` prunes that subtree. */
function walkTree(root: Node, visit: (node: Node) => boolean): void {
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node !== root && !visit(node)) continue;
    for (let i = node.namedChildCount - 1; i >= 0; i--) {
      const child = node.namedChild(i);
      if (child) stack.push(child);
    }
  }
}

function splitCaptureName(name: string): [string, string | undefined] {
  const dot = name.indexOf(".");
  return dot === -1 ? [name, undefined] : [name.slice(0, dot), name.slice(dot + 1)];
}

function stripQuotes(text: string): string {
  return text.replace(/^["'`]|["'`]$/g, "");
}
