# Domain language

The words aicc uses for its own parts. Use these exactly; they appear in type names, file names and report copy, and drift between them is how the codebase starts needing a translation layer.

## Scanning

**Scan root** — the directory aicc was pointed at. Everything outside it is invisible, which is why an import that leaves the root resolves to `null` rather than being chased.

**File role** — what a file is _for_: `source`, `test`, `benchmark`, `example`, `script`, `docs`. Derived from its path. See `src/discover/role.ts`.

**Scored** — a file whose role is `source`. Only scored files count toward any metric. Benchmarks repeat names on purpose, scripts are unimported on purpose, and tests reference things the shipped program never does — judging them produces confident nonsense.

## The index

**Index** (`CodeIndex`) — every fact aicc extracted from the scan, covering all roles. Built once. Nothing downstream of it touches the filesystem or a parser.

**Scored index** (`ScoredIndex`) — the index narrowed to scored files. This is the only thing an analyzer ever sees; the type is branded so a full `CodeIndex` will not type-check in its place. Narrowing happens once, in `runAnalyzers`.

The distinction is load-bearing: the report needs the full index to say "not scored: 11 test", while every metric needs the scored one to mean anything.

**Language pack** — everything aicc knows about one language: tree-sitter queries plus the node types that count as branches, nesting, functions and identifiers.

**Smell** — a construct that hides a problem instead of handling it: an empty catch, a bare except, a linter-disabling comment, an `any`.

## Measuring

**Analyzer** — a pure function from a scored index to one metric plus its findings. Never reads the filesystem, never parses, never calls out.

**Metric** — an analyzer's headline number, always normalised so higher is worse and so it compares across repos of different sizes.

**Finding** — one concrete thing an agent would trip over, at a place in the code.

**Anchor** — the `good`/`bad` pair that maps a raw metric onto severity, with the reasoning that justifies it. Reasoned, not corpus-derived.

**Severity** — a metric mapped onto 0–100 against its anchor.

**Pillar** — which agent cost a metric belongs to: `findability`, `traceability`, `context-cost`, `slop`, `change-risk`.

**Coverage** — line hits read from an lcov report, when one exists. Null is the normal state, and it means _unknown_, never _zero_. Only `change-risk` needs it.

**CRAP** — Change Risk Anti-Patterns: `complexity² × (1 − coverage)³ + complexity`. The one metric aicc cannot compute from source alone, and so the one deliberately left out of the Slop Score.

**Slop Score** — the single 0–100 number, higher being worse, after pillars are combined and size is accounted for twice: problems weigh more at scale, and scale is itself a cost.
