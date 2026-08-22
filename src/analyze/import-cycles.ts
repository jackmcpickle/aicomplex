import type { CodeIndex } from "../index/types.js";
import { percent, type Analyzer } from "./types.js";

/**
 * Files caught in circular import chains.
 *
 * A cycle means there is no order in which an agent can read the modules and
 * have each one make sense. It also means a change anywhere in the cycle can
 * surface anywhere else in it, so "what breaks if I change this?" has no
 * bounded answer.
 *
 * Computed with Tarjan's algorithm; any strongly connected component with more
 * than one file is a cycle.
 */
export const importCycles: Analyzer = {
  name: "import-cycles",
  pillar: "traceability",
  describe: "Share of files trapped in a circular import chain",

  run(index: CodeIndex) {
    const graph = buildGraph(index);
    const components = stronglyConnected(graph).filter((component) => component.length > 1);

    const inCycle = components.reduce((sum, component) => sum + component.length, 0);

    return {
      analyzer: importCycles.name,
      pillar: importCycles.pillar,
      metric: percent(inCycle, index.files.size),
      unit: "% of files in an import cycle",
      findings: components
        .sort((a, b) => b.length - a.length)
        .slice(0, 15)
        .map((component) => ({
          message: `${component.length} files form an import cycle: ${component.slice(0, 4).join(" → ")}${component.length > 4 ? " → …" : ""}`,
          file: component[0]!,
          weight: component.length,
        })),
    };
  },
};

function buildGraph(index: CodeIndex): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const path of index.files.keys()) graph.set(path, []);

  for (const edge of index.imports) {
    if (!edge.resolved || edge.resolved === edge.from) continue;
    graph.get(edge.from)?.push(edge.resolved);
  }

  return graph;
}

/**
 * Tarjan's strongly-connected-components, written iteratively.
 *
 * A recursive version blows the stack on real repos — a few thousand files
 * with a deep import chain is enough.
 */
function stronglyConnected(graph: Map<string, string[]>): string[][] {
  const indexOf = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  for (const root of graph.keys()) {
    if (indexOf.has(root)) continue;

    const work: { node: string; childIndex: number }[] = [{ node: root, childIndex: 0 }];

    while (work.length > 0) {
      const frame = work.at(-1)!;
      const { node } = frame;

      if (frame.childIndex === 0) {
        indexOf.set(node, counter);
        lowLink.set(node, counter);
        counter++;
        stack.push(node);
        onStack.add(node);
      }

      const children = graph.get(node) ?? [];
      if (frame.childIndex < children.length) {
        const child = children[frame.childIndex]!;
        frame.childIndex++;

        if (!indexOf.has(child)) {
          work.push({ node: child, childIndex: 0 });
        } else if (onStack.has(child)) {
          lowLink.set(node, Math.min(lowLink.get(node)!, indexOf.get(child)!));
        }
        continue;
      }

      // All children visited: close this node off.
      work.pop();
      const parent = work.at(-1)?.node;
      if (parent) lowLink.set(parent, Math.min(lowLink.get(parent)!, lowLink.get(node)!));

      if (lowLink.get(node) === indexOf.get(node)) {
        const component: string[] = [];
        let member: string;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          component.push(member);
        } while (member !== node);
        components.push(component.reverse());
      }
    }
  }

  return components;
}
