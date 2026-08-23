# 1. Analyzers keep their own derivations

Date: 2026-08-23

Status: Accepted

## Context

An architecture review proposed moving the maps each analyzer derives from the
index — definition sites, the import graph, the barrel set, the referenced-name
test — up behind the index's interface, on the grounds that several analyzers
were rebuilding the same facts.

They are not. Each derivation has exactly one user:

| derivation | user |
| --- | --- |
| `definitionSites` | cross-file-connectivity |
| `isReferenced` | dead-exports |
| `findBarrels`, `chainLength` | barrel-depth |
| `buildGraph`, `stronglyConnected` | import-cycles |
| `lineWeightedPercentile` | god-files |

The review claimed `definitionSites` and `isReferenced` were competing
implementations of one question that disagreed about which definition kinds
count. On inspection they answer different questions: "which files define this
callable" and "does this name occur more often than it is defined". The
disagreement is deliberate and correct.

The one genuine overlap is that `orphan-files` builds a set of imported files
while `import-cycles` builds a file-to-file graph, both from `index.imports`.
Two callers, about four lines each, different shapes.

## Decision

Leave the derivations in the analyzers that use them.

## Consequences

Extracting a shared view for two four-line loops would move complexity rather
than concentrate it — deleting the extracted module would make it reappear in
two places, barely reduced. That is the deletion test failing, which is the bar
for adding a seam.

Revisit if a third analyzer needs the import graph, or if two analyzers ever
genuinely need the same derived view in the same shape. Until then, an analyzer
owning its own derivation is what keeps it readable in one sitting.
