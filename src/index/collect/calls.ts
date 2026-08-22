import type { Tree } from "web-tree-sitter";
import type { CompiledLanguage } from "../../parse/parser.js";
import type { CallEdge, SymbolNode } from "../types.js";
import { enclosingSymbol } from "./shared.js";

export function collectCalls(
  compiled: CompiledLanguage,
  tree: Tree,
  filePath: string,
  symbols: readonly SymbolNode[],
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
