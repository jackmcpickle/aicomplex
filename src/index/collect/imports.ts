import type { Node, QueryMatch, Tree } from "web-tree-sitter";
import type { DiscoveredFile } from "../../discover/walk.js";
import type { CompiledLanguage } from "../../parse/parser.js";
import { resolveImport } from "../resolve.js";
import type { ImportEdge, ImportKind } from "../types.js";
import { spanKey, splitCaptureName, stripQuotes } from "./shared.js";

export function collectImports(
  compiled: CompiledLanguage,
  tree: Tree,
  file: DiscoveredFile,
  knownFiles: ReadonlySet<string>,
): ImportEdge[] {
  const matches = compiled.queries.imports.matches(tree.rootNode);
  const edges = new Map<string, ImportEdge>();
  const spans: { key: string; start: number; end: number }[] = [];

  for (const match of matches) {
    const parsed = readImport(match);
    if (!parsed) continue;

    const key = spanKey(parsed.statement);
    if (edges.has(key)) continue;

    edges.set(key, {
      from: file.path,
      source: parsed.source,
      resolved: resolveImport(file.path, parsed.source, file.language, knownFiles),
      names: [],
      kind: parsed.kind,
      line: parsed.statement.startPosition.row + 1,
    });
    spans.push({ key, start: parsed.statement.startIndex, end: parsed.statement.endIndex });
  }

  attachBindings(matches, edges, spans);

  return [...edges.values()].sort((a, b) => a.line - b.line);
}

type ParsedImport = { statement: Node; source: string; kind: ImportKind };

/**
 * Reads one import match.
 *
 * The capture named `import.source` carries the specifier; any other
 * `import.*` capture except `import.name` both marks the statement node and
 * names the kind, so `@import.dynamic` yields kind `dynamic`.
 */
function readImport(match: QueryMatch): ParsedImport | null {
  let sourceNode: Node | undefined;
  let statement: Node | undefined;
  let kind: ImportKind = "static";

  for (const capture of match.captures) {
    const [prefix, suffix] = splitCaptureName(capture.name);
    if (prefix !== "import" || !suffix) continue;

    if (suffix === "source") sourceNode = capture.node;
    else if (suffix !== "name") {
      statement = capture.node;
      kind = suffix as ImportKind;
    }
  }

  if (!sourceNode) return null;
  return { statement: statement ?? sourceNode, source: stripQuotes(sourceNode.text), kind };
}

/** Attaches each imported binding to the import statement enclosing it. */
function attachBindings(
  matches: QueryMatch[],
  edges: Map<string, ImportEdge>,
  spans: { key: string; start: number; end: number }[],
): void {
  for (const match of matches) {
    for (const capture of match.captures) {
      if (capture.name !== "import.name") continue;

      const owner = spans.find(
        (span) => capture.node.startIndex >= span.start && capture.node.endIndex <= span.end,
      );
      const edge = owner ? edges.get(owner.key) : undefined;
      if (edge && !edge.names.includes(capture.node.text)) edge.names.push(capture.node.text);
    }
  }
}
