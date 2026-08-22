import type { LanguagePack } from "../language-pack.js";

/**
 * Query fragments that compile against the plain JavaScript grammar.
 *
 * The TypeScript pack re-uses these and appends its own patterns, so nothing
 * here may reference a TypeScript-only node type.
 */

export const JS_DEFINITIONS = `
(function_declaration name: (identifier) @name) @definition.function
(generator_function_declaration name: (identifier) @name) @definition.function

; A function assigned to a binding is captured on the declarator, so that the
; module-level variable patterns below dedupe against it and lose on kind.
(lexical_declaration
  (variable_declarator
    name: (identifier) @name
    value: [(arrow_function) (function_expression) (generator_function)]) @definition.function)

(variable_declaration
  (variable_declarator
    name: (identifier) @name
    value: [(arrow_function) (function_expression) (generator_function)]) @definition.function)

(class_declaration name: (_) @name) @definition.class

(method_definition name: (_) @name) @definition.method

; Only module-level bindings are symbols. Locals inside a function body are
; noise an agent never needs to search for.
(program
  (lexical_declaration
    (variable_declarator name: (identifier) @name) @definition.variable))

(program
  (variable_declaration
    (variable_declarator name: (identifier) @name) @definition.variable))

(export_statement
  declaration: (lexical_declaration
    (variable_declarator name: (identifier) @name) @definition.variable))

(export_statement
  declaration: (variable_declaration
    (variable_declarator name: (identifier) @name) @definition.variable))
`;

export const JS_IMPORTS = `
(import_statement
  source: (string (string_fragment) @import.source)) @import.static

(import_statement
  (import_clause (identifier) @import.name))

(import_statement
  (import_clause (namespace_import (identifier) @import.name)))

(import_statement
  (import_clause (named_imports (import_specifier name: (identifier) @import.name))))

(export_statement
  source: (string (string_fragment) @import.source)) @import.reexport

; Names forwarded by a re-export. Without these the barrel looks like it uses
; nothing, and everything it forwards looks dead.
(export_statement
  (export_clause (export_specifier name: (identifier) @import.name))
  source: (string))

(call_expression
  function: (import)
  arguments: (arguments (string (string_fragment) @import.source))) @import.dynamic

((call_expression
  function: (identifier) @_fn
  arguments: (arguments (string (string_fragment) @import.source))) @import.require
  (#eq? @_fn "require"))
`;

export const JS_EXPORTS = `
(export_statement
  declaration: (function_declaration name: (identifier) @export.name))

(export_statement
  declaration: (class_declaration name: (_) @export.name))

(export_statement
  declaration: (lexical_declaration
    (variable_declarator name: (identifier) @export.name)))

(export_statement
  declaration: (variable_declaration
    (variable_declarator name: (identifier) @export.name)))

(export_statement
  (export_clause (export_specifier name: (identifier) @export.name)))

(export_statement "default" @export.default)
`;

export const JS_CALLS = `
(call_expression function: (identifier) @call.name)
(call_expression function: (member_expression property: (property_identifier) @call.name))
(new_expression constructor: (identifier) @call.name)
`;

export const JS_SMELLS = `
(catch_clause body: (statement_block) @smell.empty-catch)
(comment) @smell.ignore-comment
`;

export const JS_BRANCH_NODES = [
  "if_statement",
  "else_clause",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "switch_case",
  "catch_clause",
  "ternary_expression",
  "optional_chain",
] as const;

export const JS_NESTING_NODES = [
  "if_statement",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "switch_statement",
  "catch_clause",
] as const;

export const JS_FUNCTION_NODES = [
  "function_declaration",
  "generator_function_declaration",
  "function_expression",
  "generator_function",
  "arrow_function",
  "method_definition",
] as const;

export const JS_IDENTIFIER_NODES = [
  "identifier",
  "property_identifier",
  "shorthand_property_identifier",
  "shorthand_property_identifier_pattern",
] as const;

export const javascriptPack: LanguagePack = {
  language: "javascript",
  wasmSpecifier: "tree-sitter-javascript/tree-sitter-javascript.wasm",
  definitions: JS_DEFINITIONS,
  imports: JS_IMPORTS,
  exports: JS_EXPORTS,
  calls: JS_CALLS,
  smells: JS_SMELLS,
  branchNodes: JS_BRANCH_NODES,
  nestingNodes: JS_NESTING_NODES,
  functionNodes: JS_FUNCTION_NODES,
  identifierNodes: JS_IDENTIFIER_NODES,
};
