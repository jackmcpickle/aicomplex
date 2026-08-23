# 2. No parse seam under buildIndex

Date: 2026-08-23

Status: Accepted

## Context

`buildIndex` reads files with `node:fs` and gets grammars from a module-level cache in `src/parse/parser.ts`. There is no interface between it and either. Every test that exercises indexing therefore writes a real temporary directory and runs a real tree-sitter parse, via `test/helpers/index-fixture.ts`.

An architecture review proposed putting a source-reader interface underneath `buildIndex`, with an in-memory adapter for tests, to make those tests cheaper.

## Decision

Do not introduce the seam. Keep `buildIndex` reading the filesystem and the parser cache directly.

## Consequences

One adapter is a hypothetical seam; two is a real one. Nothing varies here but the tests, and the real parse is precisely what those tests exist to check — a fake source reader would let the tests pass while the thing being tested, turning files on disk into an index, went unexercised.

The cost is real but small: the whole suite runs in under a second, and the parse is amortised because grammars are compiled once per language and cached.

Revisit if scan time on a large repo becomes the complaint, or if a second real source of files appears — reading a git ref rather than the working tree, say. That would be a second adapter, and the seam would then be earned.
