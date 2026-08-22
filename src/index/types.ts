import type { Language } from "../discover/detect.js";
import type { DefinitionKind } from "../parse/language-pack.js";

/** `path/to/file.ts#name@startIndex` — stable across runs, unique within a scan. */
export type SymbolId = string;

export type FileNode = {
  path: string;
  language: Language;
  bytes: number;
  /** Non-blank, non-comment-only lines. */
  loc: number;
  lines: number;
  isTest: boolean;
  /** SHA-256 of the contents. Keys the parse cache and the LLM judgement cache. */
  hash: string;
};

export type SymbolNode = {
  id: SymbolId;
  name: string;
  kind: DefinitionKind;
  file: string;
  startLine: number;
  endLine: number;
  startIndex: number;
  endIndex: number;
  /** Visible outside its module: `export` in JS/TS, capitalised in Go, `__all__` or no leading underscore in Python. */
  exported: boolean;
};

export type ImportKind = "static" | "dynamic" | "require" | "reexport";

export type ImportEdge = {
  /** File containing the import statement. */
  from: string;
  /** The specifier exactly as written. */
  source: string;
  /** Path within the scan root, or null when the import leaves the codebase. */
  resolved: string | null;
  /** Named bindings pulled in. Empty for side-effect and namespace-only imports. */
  names: string[];
  kind: ImportKind;
  line: number;
};

export type CallEdge = {
  from: string;
  /** Symbol containing the call site, when the call sits inside one. */
  fromSymbol: SymbolId | null;
  /** Callee identifier as written. Resolution is name-based, so this may be ambiguous. */
  name: string;
  line: number;
};

export type CodeIndex = {
  root: string;
  files: Map<string, FileNode>;
  symbols: Map<SymbolId, SymbolNode>;
  /** Powers collision detection: a name with many entries is hard to grep for. */
  symbolsByName: Map<string, SymbolId[]>;
  imports: ImportEdge[];
  calls: CallEdge[];
  /** Files that could not be parsed, with the reason. Never silently dropped. */
  failures: { path: string; reason: string }[];
};
