import type { LanguagePack } from "../language-pack.js";

/**
 * Python has no export keyword. Visibility is convention: a leading underscore
 * means private, and `__all__` is the explicit list when a module declares one.
 * The exports query captures `__all__` entries; the underscore convention is
 * applied by the index builder.
 */
const PY_EXPORTS = `
((expression_statement
  (assignment
    left: (identifier) @_all
    right: [(list) (tuple)] (#eq? @_all "__all__")))
  @export.all)

(module
  (expression_statement
    (assignment
      left: (identifier) @_all
      right: [(list (string (string_content) @export.name))
              (tuple (string (string_content) @export.name))]))
  (#eq? @_all "__all__"))
`;

export const pythonPack: LanguagePack = {
  branchNodes: [
    "if_statement",
    "elif_clause",
    "else_clause",
    "for_statement",
    "while_statement",
    "except_clause",
    "conditional_expression",
    "boolean_operator",
    "case_clause",
    "assert_statement",
  ],
  calls: `
(call function: (identifier) @call.name)
(call function: (attribute attribute: (identifier) @call.name))
`,
  definitions: `
(function_definition name: (identifier) @name) @definition.function

(class_definition name: (identifier) @name) @definition.class

(module
  (expression_statement
    (assignment left: (identifier) @name))) @definition.variable

(class_definition
  body: (block
    (function_definition name: (identifier) @name))) @definition.method
`,
  exports: PY_EXPORTS,
  functionNodes: ["function_definition", "lambda"],
  identifierNodes: ["identifier"],
  imports: `
(import_statement name: (dotted_name) @import.source) @import.static
(import_statement name: (aliased_import name: (dotted_name) @import.source)) @import.static

(import_from_statement
  module_name: [(dotted_name) (relative_import)] @import.source) @import.static

(import_from_statement
  name: (dotted_name (identifier) @import.name))

(import_from_statement
  name: (aliased_import alias: (identifier) @import.name))
`,
  language: "python",
  nestingNodes: [
    "if_statement",
    "for_statement",
    "while_statement",
    "with_statement",
    "try_statement",
  ],
  smells: `
(except_clause) @smell.bare-except
(comment) @smell.ignore-comment
`,
  wasmSpecifier: "tree-sitter-python/tree-sitter-python.wasm",
};
