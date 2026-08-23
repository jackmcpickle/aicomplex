import type { ScoredIndex } from "../index/scope.js";
import { percent } from "./types.js";
import type { Analyzer } from "./types.js";

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
  describe: "Share of files trapped in a circular import chain",
  name: "import-cycles",
  pillar: "traceability",
  run(index: ScoredIndex) {
    const graph = buildGraph(index);
    const components = stronglyConnected(graph).filter(
      (component) => component.length > 1
    );

    const inCycle = components.reduce(
      (sum, component) => sum + component.length,
      0
    );

    return {
      metric: percent(inCycle, index.files.size),
      unit: "% of files in an import cycle",
      findings: components.flatMap((component) => {
        const [file] = component;
        if (file === undefined) {
          return [];
        }
        return [
          {
            kind: "cycle" as const,
            members: component,
            file,
            weight: component.length,
          },
        ];
      }),
    };
  },
};

/** Import graph over scored files only — a cycle among benchmarks is not a defect. */
function buildGraph(index: ScoredIndex): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const path of index.files.keys()) {
    graph.set(path, []);
  }

  for (const edge of index.imports) {
    if (edge.resolved === null || edge.resolved === edge.from) {
      continue;
    }
    const neighbors = graph.get(edge.from);
    if (neighbors === undefined || !graph.has(edge.resolved)) {
      continue;
    }
    neighbors.push(edge.resolved);
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
    if (indexOf.has(root)) {
      continue;
    }

    const work: { node: string; childIndex: number }[] = [
      { childIndex: 0, node: root },
    ];

    while (work.length > 0) {
      const frame = work.at(-1);
      if (frame === undefined) {
        break;
      }
      const { node } = frame;

      if (frame.childIndex === 0) {
        indexOf.set(node, counter);
        lowLink.set(node, counter);
        counter += 1;
        stack.push(node);
        onStack.add(node);
      }

      const children = graph.get(node) ?? [];
      if (frame.childIndex < children.length) {
        const child = children[frame.childIndex];
        frame.childIndex += 1;
        if (child === undefined) {
          continue;
        }

        if (!indexOf.has(child)) {
          work.push({ childIndex: 0, node: child });
        } else if (onStack.has(child)) {
          const nodeLow = lowLink.get(node);
          const childIndex = indexOf.get(child);
          if (nodeLow !== undefined && childIndex !== undefined) {
            lowLink.set(node, Math.min(nodeLow, childIndex));
          }
        }
        continue;
      }

      // All children visited: close this node off.
      work.pop();
      const parent = work.at(-1)?.node;
      if (parent !== undefined) {
        const parentLow = lowLink.get(parent);
        const nodeLow = lowLink.get(node);
        if (parentLow !== undefined && nodeLow !== undefined) {
          lowLink.set(parent, Math.min(parentLow, nodeLow));
        }
      }

      if (lowLink.get(node) === indexOf.get(node)) {
        const component: string[] = [];
        let member: string | undefined;
        do {
          member = stack.pop();
          if (member === undefined) {
            break;
          }
          onStack.delete(member);
          component.push(member);
        } while (member !== node);
        components.push(component.toReversed());
      }
    }
  }

  return components;
}
