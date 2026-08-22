import { describe, expect, it, onTestFinished } from "vitest";
import { indexFixture, symbolSummary } from "../helpers/index-fixture.js";

describe("buildIndex — symbols", () => {
  it("captures TypeScript definitions with their kinds and export status", async () => {
    const index = await indexFixture(
      {
        "src/a.ts": [
          "export function greet(name: string) { return name; }",
          "export const shout = (s: string) => s.toUpperCase();",
          "const secret = 1;",
          "export class Greeter { hello() { return 1; } }",
          "export interface Named { name: string }",
          "export type Id = string;",
          "export enum Colour { Red }",
        ].join("\n"),
      },
      onTestFinished,
    );

    expect(symbolSummary(index)).toEqual([
      "src/a.ts:greet:function:exported",
      "src/a.ts:shout:function:exported",
      "src/a.ts:secret:variable",
      "src/a.ts:Greeter:class:exported",
      "src/a.ts:hello:method",
      "src/a.ts:Named:interface:exported",
      "src/a.ts:Id:type:exported",
      "src/a.ts:Colour:enum:exported",
    ]);
  });

  it("prefers the more specific kind when patterns overlap", async () => {
    const index = await indexFixture(
      { "a.ts": "const handler = () => 1;\nconst count = 2;\n" },
      onTestFinished,
    );

    expect(symbolSummary(index)).toEqual(["a.ts:handler:function", "a.ts:count:variable"]);
  });

  it("uses the underscore convention for Python visibility", async () => {
    const index = await indexFixture(
      { "app/main.py": "def public():\n    pass\n\ndef _private():\n    pass\n" },
      onTestFinished,
    );

    expect(symbolSummary(index)).toEqual([
      "app/main.py:public:function:exported",
      "app/main.py:_private:function",
    ]);
  });

  it("honours __all__ when a Python module declares one", async () => {
    const index = await indexFixture(
      {
        "app/main.py": ['__all__ = ["only_this"]', "", "def only_this():", "    pass", "", "def other():", "    pass"].join("\n"),
      },
      onTestFinished,
    );

    const exported = [...index.symbols.values()].filter((s) => s.exported).map((s) => s.name);
    expect(exported).toEqual(["only_this"]);
  });

  it("uses capitalisation for Go visibility", async () => {
    const index = await indexFixture(
      {
        "cmd/root.go": [
          "package main",
          "",
          "type Server struct { port int }",
          "",
          "func Start() {}",
          "",
          "func stop() {}",
        ].join("\n"),
      },
      onTestFinished,
    );

    expect(symbolSummary(index)).toEqual([
      "cmd/root.go:Server:class:exported",
      "cmd/root.go:Start:function:exported",
      "cmd/root.go:stop:function",
    ]);
  });

  it("groups symbols by name so collisions are visible", async () => {
    const index = await indexFixture(
      {
        "a/handler.ts": "export function handler() {}",
        "b/handler.ts": "export function handler() {}",
        "c/handler.ts": "export function handler() {}",
      },
      onTestFinished,
    );

    expect(index.symbolsByName.get("handler")).toHaveLength(3);
  });
});

describe("buildIndex — imports", () => {
  it("records specifiers, bindings and kinds for TypeScript", async () => {
    const index = await indexFixture(
      {
        "src/util.ts": "export const helper = () => 1;",
        "src/main.ts": [
          "import { helper } from './util.js';",
          "import * as fs from 'node:fs';",
          "import React from 'react';",
          "const lazy = await import('./util.js');",
        ].join("\n"),
      },
      onTestFinished,
    );

    const imports = index.imports.filter((i) => i.from === "src/main.ts");

    expect(imports).toMatchObject([
      { source: "./util.js", resolved: "src/util.ts", names: ["helper"], kind: "static" },
      { source: "node:fs", resolved: null, names: ["fs"], kind: "static" },
      { source: "react", resolved: null, names: ["React"], kind: "static" },
      { source: "./util.js", resolved: "src/util.ts", names: [], kind: "dynamic" },
    ]);
  });

  it("resolves an extensionless import to its index file", async () => {
    const index = await indexFixture(
      {
        "src/util/index.ts": "export const helper = () => 1;",
        "src/main.ts": "import { helper } from './util';",
      },
      onTestFinished,
    );

    expect(index.imports[0]).toMatchObject({ resolved: "src/util/index.ts" });
  });

  it("marks re-exports so barrel chains can be traced", async () => {
    const index = await indexFixture(
      {
        "src/util.ts": "export const helper = () => 1;",
        "src/index.ts": "export { helper } from './util.js';",
      },
      onTestFinished,
    );

    expect(index.imports).toMatchObject([
      { from: "src/index.ts", resolved: "src/util.ts", kind: "reexport" },
    ]);
  });

  it("resolves relative Python imports", async () => {
    const index = await indexFixture(
      {
        "app/util.py": "def helper():\n    pass\n",
        "app/main.py": "from .util import helper\n",
      },
      onTestFinished,
    );

    expect(index.imports).toMatchObject([
      { from: "app/main.py", source: ".util", resolved: "app/util.py", names: ["helper"] },
    ]);
  });

  it("resolves absolute Python imports within the scan root", async () => {
    const index = await indexFixture(
      {
        "app/util.py": "def helper():\n    pass\n",
        "app/main.py": "from app.util import helper\nimport os\n",
      },
      onTestFinished,
    );

    expect(index.imports).toMatchObject([
      { source: "app.util", resolved: "app/util.py" },
      { source: "os", resolved: null },
    ]);
  });

  it("records Go imports as external module paths", async () => {
    const index = await indexFixture(
      { "cmd/root.go": 'package main\n\nimport "fmt"\n' },
      onTestFinished,
    );

    expect(index.imports).toMatchObject([{ source: "fmt", resolved: null }]);
  });
});

describe("buildIndex — calls", () => {
  it("attributes a call to the symbol containing it", async () => {
    const index = await indexFixture(
      {
        "a.ts": ["function inner() { return 1; }", "function outer() { return inner(); }"].join(
          "\n",
        ),
      },
      onTestFinished,
    );

    const call = index.calls.find((c) => c.name === "inner");
    const outer = [...index.symbols.values()].find((s) => s.name === "outer");

    expect(call?.fromSymbol).toBe(outer?.id);
  });

  it("records a top-level call as belonging to no symbol", async () => {
    const index = await indexFixture({ "a.ts": "console.log('hi');" }, onTestFinished);

    expect(index.calls).toMatchObject([{ name: "log", fromSymbol: null, line: 1 }]);
  });

  it("captures Python and Go call sites", async () => {
    const index = await indexFixture(
      {
        "app/main.py": "def run():\n    helper()\n",
        "cmd/root.go": "package main\n\nfunc Run() { helper() }\n",
      },
      onTestFinished,
    );

    expect(index.calls.map((c) => `${c.from}:${c.name}`)).toEqual([
      "app/main.py:helper",
      "cmd/root.go:helper",
    ]);
  });
});

describe("buildIndex — files", () => {
  it("records loc, line count and a content hash", async () => {
    const index = await indexFixture(
      { "a.ts": "const a = 1;\n\nconst b = 2;\n" },
      onTestFinished,
    );

    const file = index.files.get("a.ts")!;
    expect(file).toMatchObject({ lines: 4, loc: 2, language: "typescript" });
    expect(file.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("indexes every file without failures", async () => {
    const index = await indexFixture(
      {
        "a.ts": "export const a = 1;",
        "b.py": "b = 1\n",
        "c.go": "package main\n",
        "d.tsx": "export const D = () => <div />;",
        "e.js": "export const e = 1;",
      },
      onTestFinished,
    );

    expect(index.failures).toEqual([]);
    expect(index.files.size).toBe(5);
  });
});
