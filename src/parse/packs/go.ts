import type { LanguagePack } from "../language-pack.js";

/**
 * Go's export rule is capitalisation, not syntax, so there is nothing useful
 * for an exports query to capture. The index builder derives visibility from
 * the identifier instead.
 */
export const goPack: LanguagePack = {
  language: "go",
  wasmSpecifier: "tree-sitter-go/tree-sitter-go.wasm",

  definitions: `
(function_declaration name: (identifier) @name) @definition.function
(method_declaration name: (field_identifier) @name) @definition.method

(type_declaration
  (type_spec name: (type_identifier) @name type: (interface_type))) @definition.interface
(type_declaration
  (type_spec name: (type_identifier) @name type: (struct_type))) @definition.class
(type_declaration (type_spec name: (type_identifier) @name)) @definition.type

(const_declaration (const_spec name: (identifier) @name)) @definition.constant
(var_declaration (var_spec name: (identifier) @name)) @definition.variable
`,

  imports: `
(import_spec path: (interpreted_string_literal) @import.source) @import.static
(import_spec name: (package_identifier) @import.name)
`,

  exports: "",

  calls: `
(call_expression function: (identifier) @call.name)
(call_expression function: (selector_expression field: (field_identifier) @call.name))
`,

  branchNodes: [
    "if_statement",
    "for_statement",
    "expression_case",
    "type_case",
    "communication_case",
    "select_statement",
    "type_switch_statement",
  ],

  functionNodes: ["function_declaration", "method_declaration", "func_literal"],
};
