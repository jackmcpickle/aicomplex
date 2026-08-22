import type { LanguagePack } from "../language-pack.js";
import {
  JS_BRANCH_NODES,
  JS_CALLS,
  JS_DEFINITIONS,
  JS_EXPORTS,
  JS_FUNCTION_NODES,
  JS_IMPORTS,
  JS_NESTING_NODES,
  JS_SMELLS,
} from "./javascript.js";

/** Patterns for node types that exist only in the TypeScript/TSX grammars. */
const TS_DEFINITIONS = `
(interface_declaration name: (type_identifier) @name) @definition.interface
(type_alias_declaration name: (type_identifier) @name) @definition.type
(enum_declaration name: (identifier) @name) @definition.enum
(function_signature name: (identifier) @name) @definition.function
(method_signature name: (property_identifier) @name) @definition.method
(abstract_class_declaration name: (type_identifier) @name) @definition.class
(abstract_method_signature name: (property_identifier) @name) @definition.method
`;

const TS_EXPORTS = `
(export_statement declaration: (interface_declaration name: (type_identifier) @export.name))
(export_statement declaration: (type_alias_declaration name: (type_identifier) @export.name))
(export_statement declaration: (enum_declaration name: (identifier) @export.name))
(export_statement declaration: (abstract_class_declaration name: (type_identifier) @export.name))
`;

/** `any` erases the type system locally, which is how a type error gets silenced. */
const TS_SMELLS = `
(predefined_type) @smell.any-type
`;

const TS_BRANCH_NODES = [...JS_BRANCH_NODES, "non_null_expression"] as const;

const shared = {
  definitions: JS_DEFINITIONS + TS_DEFINITIONS,
  imports: JS_IMPORTS,
  exports: JS_EXPORTS + TS_EXPORTS,
  calls: JS_CALLS,
  smells: JS_SMELLS + TS_SMELLS,
  branchNodes: TS_BRANCH_NODES,
  nestingNodes: JS_NESTING_NODES,
  functionNodes: JS_FUNCTION_NODES,
};

export const typescriptPack: LanguagePack = {
  language: "typescript",
  wasmSpecifier: "tree-sitter-typescript/tree-sitter-typescript.wasm",
  ...shared,
};

/**
 * TSX gets its own grammar because `<T>` is a cast in .ts and a JSX element in
 * .tsx. The queries are identical; only the WASM differs.
 */
export const tsxPack: LanguagePack = {
  language: "tsx",
  wasmSpecifier: "tree-sitter-typescript/tree-sitter-tsx.wasm",
  ...shared,
};
