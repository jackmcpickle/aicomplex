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
 *
 * Counted per file rather than merged across the scan, because occurrences
 * cannot be un-summed afterwards: narrowing to shipped source has to drop a
 * test file's mentions, and a single merged total makes that impossible.
 */
export function countIdentifiers(compiled: CompiledLanguage, tree: Tree): Map<string, number> {
  const identifierNodes = new Set(compiled.pack.identifierNodes);
  const counts = new Map<string, number>();

  walkTree(tree.rootNode, (node) => {
    if (identifierNodes.has(node.type)) {
      const name = node.text;
      counts.set(name, (counts.get(name) ?? 0) + 1);
      return false; // Identifiers have no interesting children.
    }
    return true;
  });

  return counts;
}
