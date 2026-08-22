# aicc

Measure how much **slop** a codebase is carrying — from the point of view of an
AI agent trying to work in it.

```bash
npx aicc scan .
```

## Why

AI agents write a lot of code, fast. GitClear tracked what that does to a repo
across 211M lines: duplicate blocks **+8x**, cross-file function calls **-35%**,
refactoring **-70%**, error-masking **+47%**, two-week churn **3.1% → 7.1%**.

The result reads fine file-by-file but is structurally bloated, and each agent
leaves the repo harder to work in for the next one.

Existing tools don't measure this. Linters find rule violations. "AI detectors"
guess whether a file was model-written, which is the wrong question. GitClear
measures authoring behaviour from git history, as SaaS. Nothing scores the
**current snapshot** for **agent navigability**. That's what aicc does.

## What it measures

Four pillars. Every metric is normalised so **higher is worse**.

**Findability** — can an agent locate things?
- `symbol-collision` — share of definitions whose name doesn't uniquely identify them
- `orphan-files` — share of source files nothing imports
- `barrel-depth` — share of imports routed through re-export barrels

**Traceability** — can an agent follow a change?
- `import-cycles` — share of files in a circular import chain
- `cross-file-connectivity` — share of internal calls that never leave their file

**Context cost** — how much must it read?
- `god-files` — share of lines in files too large to read in one pass
- `function-complexity` — share of functions too branchy or too deeply nested

**Slop signals** — the AI tells
- `duplication` — share of function bodies with a structural twin elsewhere
- `error-masking` — silenced errors, blanket ignores and `any` per 1k lines
- `dead-exports` — share of exports nothing references

Only shipped source is scored. Benchmarks, examples, docs, scripts and tests
are classified and skipped — they legitimately repeat names and sit unimported,
so scoring them turns real signal into noise.

Duplication matches on the AST shape with identifiers and literals erased, so a
copied function whose variables were renamed still counts. Token-based
detectors miss exactly that case, which is the one agents produce most.

## Example

```
$ aicc scan ./zod

  155 scored files · 5523 symbols · 1329 imports · 46347 calls
  not scored: 198 test · 81 benchmark · 14 script · 39 docs

     11.3  barrel-depth             % of internal imports routed through a barrel
           packages/zod/src/v4/core/index.ts is a barrel used by 27 import(s), 2 re-exports deep

     54.2  import-cycles            % of files in an import cycle
           76 files form an import cycle: core/compile.ts → core/checks.ts → core/core.ts → …

     65.4  god-files                % of lines in files over 400 lines
           packages/zod/src/v3/types.ts is 4636 lines — roughly 45.8k tokens to read

     36.5  duplication              % of function bodies duplicated elsewhere
           18 copies of the same 121-line body across 18 file(s): error
```

## Languages

TypeScript, TSX, JavaScript, Python, Go — parsed with tree-sitter (WASM, so no
native toolchain needed). Adding a language is one `LanguagePack`.

## Status

Early. The metrics work and are tested, but there is **no composite Slop Score
yet** — a single number is meaningless until the metrics are calibrated against
a reference corpus of known-good and known-sloppy repos. Reporting one now
would be an opinion dressed as data.

## Development

```bash
pnpm install
pnpm test          # unit tests, one fixture per analyzer
pnpm typecheck
pnpm dev scan .    # run from source
```

Architecture: `discover` → `parse` → `index` → `analyze` → `report`. Everything
downstream of `src/index/build.ts` is a pure function over the `CodeIndex`, so
analyzers never touch the filesystem and stay individually testable.

## License

MIT
