import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [core, vitest],
  ignorePatterns: [...core.ignorePatterns, ".handover"],
  jsPlugins: ["eslint-plugin-crap"],
  rules: {
    "crap/crap": [
      "warn",
      { lcovPath: "coverage/lcov.info", maxCrap: 5, warnMissing: false },
    ],
    // Discriminated unions and measurements keep semantic key order
    // (`kind` first), not alphabetical.
    "eslint/sort-keys": "off",
    // Public function first, helpers below. Function declarations hoist;
    // converting them to expressions would force every file to invert.
    "eslint/func-style": "off",
    "eslint/no-use-before-define": "off",
    // Load-bearing explanations sit next to the line they justify.
    "eslint/no-inline-comments": "off",
    // Path and lcov regexes classify filenames; named groups add no meaning.
    "eslint/prefer-named-capture-group": "off",
    // Sequential reads are the walk / index contract, not an accident.
    "eslint/no-await-in-loop": "off",
    // Terminal and analyzer tests assert many independent fields.
    "vitest/max-expects": "off",
  },
  overrides: [
    {
      files: ["test/**/*.ts"],
      rules: {
        "vitest/max-expects": "off",
      },
    },
  ],
});
