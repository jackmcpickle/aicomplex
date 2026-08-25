# aicomplex — AI Code Complexity

[![npm](https://img.shields.io/npm/v/aicomplex)](https://www.npmjs.com/package/aicomplex) [![CI](https://img.shields.io/github/actions/workflow/status/jackmcpickle/aicomplex/ci.yml?branch=main&label=CI)](https://github.com/jackmcpickle/aicomplex/actions/workflows/ci.yml) [![dependencies](https://img.shields.io/librariesio/release/npm/aicomplex)](package.json) [![License](https://img.shields.io/npm/l/aicomplex)](LICENSE)

Measure how much **slop** a codebase is carrying — from the point of view of an AI agent trying to work in it.

```bash
npx aicomplex scan .
```

## Why

AI agents write a lot of code, fast. GitClear tracked what that does to a repo across 211M lines: duplicate blocks **+8x**, cross-file function calls **-35%**, refactoring **-70%**, error-masking **+47%**, two-week churn **3.1% → 7.1%**.

The result reads fine file-by-file but is structurally bloated, and each agent leaves the repo harder to work in for the next one.

Existing tools don't measure this. Linters find rule violations. "AI detectors" guess whether a file was model-written, which is the wrong question. GitClear measures authoring behaviour from git history, as SaaS. Nothing scores the **current snapshot** for **agent navigability**. That's what aicomplex does.

## The Slop Score

One number, 0–100, **higher is worse**, plus a grade.

Ten metrics across four pillars are each mapped onto 0–100 against a documented "good" and "bad" anchor, averaged per pillar, then averaged across pillars.

**Size counts twice**, deliberately:

- The same 20% duplication costs more in a 500k-line codebase than a 2k-line one, because an agent's chance of ever seeing enough of it to notice drops as the codebase grows. So problems are weighted from 0.85x up to 1.15x with scale.
- Scale is a cost by itself. A million-line codebase with no measurable defects is still harder to work in, so up to 10 points of burden are added on size alone.

The report shows how much of the score came from each.

```
  SLOP 72/100  F   █████████████████·······
  67 from metrics, +5 for size (32.8k lines across 155 files)
```

Measured across a small corpus:

| repo      | score |     | notes                                        |
| --------- | ----- | --- | -------------------------------------------- |
| aicomplex | 5     | A   | small, and it eats its own cooking           |
| cobra     | 24    | B   | large files, some duplication                |
| vite      | 38    | C   | big, cyclic, but low duplication             |
| flask     | 43    | C   | 83% of files in an import cycle              |
| zod       | 72    | F   | 1717-line median file, 37% duplicated bodies |

The anchors are reasoned, not corpus-derived. Run `aicomplex --why` to see each metric's thresholds and the argument for them, or read `src/score/anchors.ts`. Use the score to compare repos and to track one repo over time, not as an absolute measurement.

## What it measures

Five pillars — four scored, one reported. Every metric is normalised so **higher is worse**.

**Findability** — can an agent locate things?

- `symbol-collision` — share of definitions whose name doesn't uniquely identify them
- `orphan-files` — share of source files nothing imports
- `barrel-depth` — share of imports routed through re-export barrels

**Traceability** — can an agent follow a change?

- `import-cycles` — share of files in a circular import chain
- `cross-file-connectivity` — share of internal calls that never leave their file

**Context cost** — how much must it read?

- `god-files` — size of the file a randomly chosen line lives in
- `function-complexity` — share of functions too branchy or too deeply nested

**Slop signals** — the AI tells

- `duplication` — share of function bodies with a structural twin elsewhere
- `error-masking` — silenced errors, blanket ignores and `any` per 1k lines
- `dead-exports` — share of exports nothing references

**Change risk** — complexity nothing tests. _Reported, not scored._

- `crap` — share of functions over CRAP 5 / 15 / 30, averaged

Only shipped source is scored. Benchmarks, examples, docs, scripts and tests are classified and skipped — they legitimately repeat names and sit unimported, so scoring them turns real signal into noise.

Duplication matches on the AST shape with identifiers and literals erased, so a copied function whose variables were renamed still counts. Token-based detectors miss exactly that case, which is the one agents produce most.

## CRAP

Change Risk Anti-Patterns, from Savoia and Evans' Crap4j (2007):

```
CRAP(f) = complexity² × (1 − coverage)³ + complexity
```

Coverage is cubed, so a complex function that is well tested is nearly as safe to change as a simple one. Complexity alone isn't risk — complexity you can't verify is.

It needs a coverage report, which aicomplex can't produce from source alone:

```bash
bun coverage                  # writes coverage/lcov.info
aicomplex                          # picks it up automatically
aicomplex --lcov path/to/lcov.info # or point at one
```

Without a report, `crap` says so rather than reporting a clean zero — unknown coverage is not the same as good coverage.

**It's reported but deliberately excluded from the Slop Score.** Every other metric is computable from a checkout alone. Letting CRAP into the score would mean a repo with tests and a repo without are graded on different metrics, and the score is meant for comparison.

Three thresholds rather than the conventional single cutoff of 30: a codebase where every function sits at 29 and one where they all sit at 6 both score zero against `maxCrap: 30`. Averaging the share over 5, 15 and 30 gives a number that moves with the whole distribution.

aicomplex's cyclomatic complexity isn't identical to [eslint-plugin-crap](https://www.npmjs.com/package/eslint-plugin-crap)'s. aicomplex attributes a nested function's branches to that function rather than its parent, and doesn't count `&&`/`||` as decision points. Expect the same function to score somewhat lower here.

## Example

```
$ aicomplex scan ./zod

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

TypeScript, TSX, JavaScript, Python, Go — parsed with tree-sitter (WASM, so no native toolchain needed). Adding a language is one `LanguagePack`.

## Status

Early but usable. The metrics work, are tested, and separate real codebases.

The main limitation is that the score's thresholds are argued for rather than derived from a large corpus. Each one is documented with its reasoning in `src/score/anchors.ts` so it can be disagreed with. Next up: a proper calibration corpus, git churn, and an optional LLM pass for the judgements static analysis cannot make.

## Development

```bash
pnpm install
pnpm test          # unit tests, one fixture per analyzer
pnpm coverage      # writes coverage/lcov.info, which the crap metric reads
pnpm typecheck
pnpm check         # oxlint + oxfmt via Ultracite
pnpm fix           # auto-fix lint and format
pnpm dev scan .    # run from source
```

Architecture: `discover` → `parse` → `index` → `analyze` → `report`. Everything downstream of `src/index/build.ts` is a pure function over the `CodeIndex`, so analyzers never touch the filesystem and stay individually testable.

## License

MIT
