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

Context cost and slop signals are next.

## Example

```
$ aicc scan ./zod

  Findability — can an agent locate things?

     11.6  barrel-depth             % of internal imports routed through a barrel
           packages/zod/src/v4/index.ts is a barrel used by 6 import(s), 5 re-exports deep

  Traceability — can an agent follow a change?

     17.2  import-cycles            % of files in an import cycle
           76 files form an import cycle: core/index.ts → core/core.ts → core/errors.ts → …
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
