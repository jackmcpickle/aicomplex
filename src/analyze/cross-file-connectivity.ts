import type { CodeIndex, SymbolNode } from "../index/types.js";
import { isScored, percent, type Analyzer } from "./types.js";

/**
 * How much of the codebase's own code actually calls the rest of it.
 *
 * GitClear tracked this across 211M lines and found cross-file function calls
 * fell 35% as AI assistance spread. The mechanism is simple: an agent given a
 * task in one file will re-implement a helper locally rather than go find the
 * existing one. Each instance looks fine. In aggregate the codebase stops
 * being a system and becomes a pile of self-contained islands that must all be
 * changed together.
 *
 * Only calls that resolve to a definition somewhere in the scan are counted —
 * library and builtin calls say nothing about internal cohesion.
 */
export const crossFileConnectivity: Analyzer = {
  name: "cross-file-connectivity",
  pillar: "traceability",
  describe: "Share of internal calls that stay inside their own file",

  run(index: CodeIndex) {
    const definedIn = definitionSites(index);

    let internal = 0;
    let sameFile = 0;

    /** file → local callees whose name also exists in other files. */
    const reimplemented = new Map<string, Set<string>>();

    for (const call of index.calls) {
      if (!isScored(index, call.from)) continue;

      const sites = definedIn.get(call.name);
      if (!sites || sites.size === 0) continue; // Library or builtin.

      internal++;
      if (!sites.has(call.from)) continue;

      sameFile++;

      // A file calling its own private helper is good design, not slop. What
      // matters is calling a local helper whose name is *also* defined
      // elsewhere — that is the shape of a re-implemented shared utility.
      if (sites.size > 1) {
        const bucket = reimplemented.get(call.from);
        if (bucket) bucket.add(call.name);
        else reimplemented.set(call.from, new Set([call.name]));
      }
    }

    return {
      analyzer: crossFileConnectivity.name,
      pillar: crossFileConnectivity.pillar,
      metric: percent(sameFile, internal),
      unit: "% of internal calls that never leave their file",
      findings: [...reimplemented]
        .map(([file, names]) => ({ file, names: [...names].sort() }))
        .sort((a, b) => b.names.length - a.names.length)
        .slice(0, 25)
        .map(({ file, names }) => ({
          message:
            `${file} calls its own ${names.slice(0, 3).map((n) => `${n}()`).join(", ")}` +
            `${names.length > 3 ? ` and ${names.length - 3} more` : ""} — ` +
            `also defined in ${definedIn.get(names[0]!)!.size - 1} other file(s)`,
          file,
          weight: names.length,
        })),
    };
  },
};

/** name → set of files defining it. Name-based, so deliberately approximate. */
function definitionSites(index: CodeIndex): Map<string, Set<string>> {
  const sites = new Map<string, Set<string>>();

  for (const symbol of index.symbols.values()) {
    if (!isCallable(symbol) || !isScored(index, symbol.file)) continue;
    const bucket = sites.get(symbol.name);
    if (bucket) bucket.add(symbol.file);
    else sites.set(symbol.name, new Set([symbol.file]));
  }

  return sites;
}

function isCallable(symbol: SymbolNode): boolean {
  return symbol.kind === "function" || symbol.kind === "method" || symbol.kind === "class";
}
