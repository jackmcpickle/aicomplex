import { createHash } from "node:crypto";
import type { Node, Tree } from "web-tree-sitter";
import type { LanguagePack } from "../../parse/language-pack.js";
import type { FunctionNode, SymbolNode } from "../types.js";
import { enclosingSymbol, walkTree } from "./shared.js";

/**
 * Measures every function body in the file.
 *
 * One walk collects shape, branches and depth together, because re-walking
 * per metric is where a whole-repo scan starts costing real time.
 */
export function collectFunctions(
  pack: LanguagePack,
  tree: Tree,
  filePath: string,
  symbols: readonly SymbolNode[],
): FunctionNode[] {
  const sets: NodeSets = {
    functionNodes: new Set(pack.functionNodes),
    branchNodes: new Set(pack.branchNodes),
    nestingNodes: new Set(pack.nestingNodes),
  };
  const functions: FunctionNode[] = [];

  walkTree(tree.rootNode, (node) => {
    if (!sets.functionNodes.has(node.type)) return true;

    const measured = measureBody(node, sets);
    const symbol = enclosingSymbol(symbols, node.startIndex);

    functions.push({
      file: filePath,
      symbol: symbol?.id ?? null,
      name: symbol?.name ?? "<anonymous>",
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      lines: node.endPosition.row - node.startPosition.row + 1,
      complexity: measured.complexity,
      maxDepth: measured.maxDepth,
      shapeHash: createHash("sha256").update(measured.shape.join(",")).digest("hex").slice(0, 32),
      shapeSize: measured.shape.length,
    });

    return true; // Keep descending: nested functions are functions too.
  });

  return functions;
}

type NodeSets = {
  functionNodes: ReadonlySet<string>;
  branchNodes: ReadonlySet<string>;
  nestingNodes: ReadonlySet<string>;
};

type Measured = { complexity: number; maxDepth: number; shape: string[] };

/**
 * Walks one function body.
 *
 * Nested function bodies are skipped so their branches and shape belong to
 * them rather than inflating their parent. Depth restarts at zero for each
 * function, so a deeply nested helper is not punished for where it lives.
 */
function measureBody(root: Node, sets: NodeSets): Measured {
  const result: Measured = { complexity: 1, maxDepth: 0, shape: [] };

  const visit = (node: Node, depth: number): void => {
    for (const child of node.namedChildren) {
      if (!child) continue;

      result.shape.push(child.type);
      if (sets.functionNodes.has(child.type)) continue;

      if (sets.branchNodes.has(child.type)) result.complexity++;

      const nextDepth =
        sets.nestingNodes.has(child.type) && !isChainedElse(child) ? depth + 1 : depth;

      result.maxDepth = Math.max(result.maxDepth, nextDepth);
      visit(child, nextDepth);
    }
  };

  visit(root, 0);
  return result;
}

/**
 * True for the `if` in an `else if`.
 *
 * Such an `if` continues the chain rather than sitting inside it. Without
 * this, a forty-case dispatch written as `else if` reports a depth of forty.
 */
function isChainedElse(node: Node): boolean {
  const parentType = node.parent?.type;
  return parentType === "else_clause" || parentType === "elif_clause";
}
