import type { Tree } from "web-tree-sitter";
import type { CompiledLanguage } from "../../parse/parser.js";
import { walkTree } from "./shared.js";

/**
 * Counts how often each identifier appears anywhere in a file.
 *
 * Calls and imports only see part of the picture. A type used purely in an
 * annotation is never called and, within its own module, never imported — so
 * `dead-exports` confidently reported every such type as unused. Counting raw
 * identifier occurrences catches those, and every other reference form the
 * queries would otherwise have to enumerate one at a time.
 *
 * The count includes the definition's own name, so a name is referenced when
 * it occurs more often than it is defined.
 */
export function countIdentifiers(
  compiled: CompiledLanguage,
  tree: Tree,
  into: Map<string, number>,
): void {
  const identifierNodes = new Set(compiled.pack.identifierNodes);

  walkTree(tree.rootNode, (node) => {
    if (identifierNodes.has(node.type)) {
      const name = node.text;
      into.set(name, (into.get(name) ?? 0) + 1);
      return false; // Identifiers have no interesting children.
    }
    return true;
  });
}
