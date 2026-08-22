import type { Language } from "../discover/detect.js";
import type { FileRole } from "../discover/role.js";
import type { DefinitionKind, SmellKind } from "../parse/language-pack.js";

/** `path/to/file.ts#name@startIndex` — stable across runs, unique within a scan. */
export type SymbolId = string;

export type FileNode = {
  path: string;
  language: Language;
  bytes: number;
  /** Non-blank, non-comment-only lines. */
  loc: number;
  lines: number;
  role: FileRole;
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

/** One function body, with the measurements every context-cost metric needs. */
export type FunctionNode = {
  file: string;
  /** Enclosing named symbol, when the function has a name. */
  symbol: SymbolId | null;
  name: string;
  startLine: number;
  endLine: number;
  lines: number;
  /** McCabe. Branches inside nested functions belong to those functions, not this one. */
  complexity: number;
  /** Deepest nesting of blocks, which is what actually makes code hard to hold in mind. */
  maxDepth: number;
  /**
   * Hash of the body's AST shape with every identifier and literal erased.
   *
   * Two functions that differ only in names and values hash identically. This
   * is what catches the copy-paste-then-rename that token-based duplication
   * detectors miss entirely.
   */
  shapeHash: string;
  /** Named AST nodes in the body. Guards against matching trivial bodies. */
  shapeSize: number;
};

export type Smell = {
  file: string;
  line: number;
  kind: SmellKind;
  /** The offending source, trimmed, for the report. */
  text: string;
};

export type CodeIndex = {
  root: string;
  files: Map<string, FileNode>;
  symbols: Map<SymbolId, SymbolNode>;
  /** Powers collision detection: a name with many entries is hard to grep for. */
  symbolsByName: Map<string, SymbolId[]>;
  /**
   * How often each identifier occurs anywhere in the scan, definitions
   * included. A name occurring more often than it is defined is referenced
   * somewhere — including from type annotations, which calls and imports miss.
   */
  identifierCounts: Map<string, number>;
  imports: ImportEdge[];
  calls: CallEdge[];
  functions: FunctionNode[];
  smells: Smell[];
  /** Files that could not be parsed, with the reason. Never silently dropped. */
  failures: { path: string; reason: string }[];
};
