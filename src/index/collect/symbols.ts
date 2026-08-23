import type { Node, QueryMatch, Tree } from "web-tree-sitter";

import type { Language } from "../../discover/detect.js";
import {
  isDefinitionKind,
  moreSpecificKind,
} from "../../parse/language-pack.js";
import type { DefinitionKind } from "../../parse/language-pack.js";
import type { CompiledLanguage } from "../../parse/parser.js";
import type { SymbolNode } from "../types.js";
import { splitCaptureName, spanKey } from "./shared.js";

export interface ExportedNames {
  explicit: Set<string>;
  hasExplicitList: boolean;
}

export function collectSymbols(
  compiled: CompiledLanguage,
  tree: Tree,
  filePath: string,
  language: Language,
  exportedNames: ExportedNames
): SymbolNode[] {
  /** Keyed by node span so two patterns matching one node produce one symbol. */
  const byNode = new Map<string, SymbolNode>();

  for (const match of compiled.queries.definitions.matches(tree.rootNode)) {
    const parsed = readDefinition(match);
    if (!parsed) {
      continue;
    }

    const { kind, nameNode, definitionNode } = parsed;
    const key = spanKey(definitionNode);
    const existing = byNode.get(key);

    if (existing) {
      existing.kind = moreSpecificKind(existing.kind, kind);
      continue;
    }

    const name = nameNode.text;
    byNode.set(key, {
      endIndex: definitionNode.endIndex,
      endLine: definitionNode.endPosition.row + 1,
      exported: isExported(name, language, exportedNames),
      file: filePath,
      id: `${filePath}#${name}@${definitionNode.startIndex}`,
      kind,
      name,
      startIndex: definitionNode.startIndex,
      startLine: definitionNode.startPosition.row + 1,
    });
  }

  return [...byNode.values()].toSorted((a, b) => a.startIndex - b.startIndex);
}

function readDefinition(
  match: QueryMatch
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
    if (
      prefix === "definition" &&
      rawKind !== undefined &&
      isDefinitionKind(rawKind)
    ) {
      kind = rawKind;
      definitionNode = capture.node;
    }
  }

  if (!nameNode || !definitionNode || !kind) {
    return null;
  }
  return { definitionNode, kind, nameNode };
}

export function collectExportedNames(
  compiled: CompiledLanguage,
  tree: Tree
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

  return { explicit, hasExplicitList };
}

/**
 * Whether a name is visible outside its module.
 *
 * Each language decides differently: JavaScript and TypeScript by keyword, Go
 * by capitalisation, and Python by `__all__` when a module declares one and
 * the underscore convention when it does not.
 */
function isExported(
  name: string,
  language: Language,
  exported: ExportedNames
): boolean {
  if (language === "go") {
    return /^[A-Z]/u.test(name);
  }
  if (language === "python") {
    return exported.hasExplicitList
      ? exported.explicit.has(name)
      : !name.startsWith("_");
  }
  return exported.explicit.has(name);
}
