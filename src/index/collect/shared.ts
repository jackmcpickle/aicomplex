import type { Node } from "web-tree-sitter";
import type { SymbolNode } from "../types.js";

/** Pre-order walk. Returning false from `visit` prunes that subtree. */
export function walkTree(root: Node, visit: (node: Node) => boolean): void {
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

/** Splits `definition.function` into `["definition", "function"]`. */
export function splitCaptureName(name: string): [string, string | undefined] {
  const dot = name.indexOf(".");
  return dot === -1 ? [name, undefined] : [name.slice(0, dot), name.slice(dot + 1)];
}

export function stripQuotes(text: string): string {
  return text.replace(/^["'`]|["'`]$/g, "");
}

/** Identifies a node by its source span, for deduplicating query matches. */
export function spanKey(node: Node): string {
  return `${node.startIndex}:${node.endIndex}`;
}

/**
 * The tightest-spanning symbol containing `offset`.
 *
 * Tightest rather than first, so code inside a nested function is attributed
 * to that function rather than to whatever encloses it.
 */
export function enclosingSymbol(
  symbols: readonly SymbolNode[],
  offset: number,
): SymbolNode | undefined {
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
