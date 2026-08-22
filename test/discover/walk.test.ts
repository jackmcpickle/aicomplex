import { describe, expect, it, onTestFinished } from "vitest";
import { walk } from "../../src/discover/walk.js";
import { makeTmpRepo } from "../helpers/tmp-repo.js";

const paths = async (root: string, options?: Parameters<typeof walk>[1]) =>
  (await walk(root, options)).map((f) => f.path);

describe("walk", () => {
  it("finds source files across all supported languages", async () => {
    const root = await makeTmpRepo(
      {
        "src/index.ts": "export const a = 1;",
        "src/App.tsx": "export const App = () => null;",
        "app/main.py": "x = 1",
        "cmd/root.go": "package main",
        "README.md": "# docs",
        "styles.css": "body {}",
      },
      onTestFinished,
    );

    expect(await paths(root)).toEqual(["app/main.py", "cmd/root.go", "src/App.tsx", "src/index.ts"]);
  });

  it("returns results sorted by path so scores are reproducible", async () => {
    const root = await makeTmpRepo(
      {
        "z.ts": "export const z = 1;",
        "a.ts": "export const a = 1;",
        "m/b.ts": "export const b = 1;",
      },
      onTestFinished,
    );

    expect(await paths(root)).toEqual(["a.ts", "m/b.ts", "z.ts"]);
  });

  it("excludes dependency, build and generated output by default", async () => {
    const root = await makeTmpRepo(
      {
        "src/index.ts": "export const a = 1;",
        "node_modules/pkg/index.ts": "export const dep = 1;",
        "dist/index.ts": "export const built = 1;",
        "coverage/report.js": "// coverage",
        "vendor/lib.go": "package vendor",
        "src/types.d.ts": "declare const x: number;",
        "src/app.min.js": "var a=1;",
        "api/service.pb.go": "package api",
      },
      onTestFinished,
    );

    expect(await paths(root)).toEqual(["src/index.ts"]);
  });

  it("respects a root .gitignore", async () => {
    const root = await makeTmpRepo(
      {
        ".gitignore": "generated/\n*.tmp.ts\n",
        "src/index.ts": "export const a = 1;",
        "generated/schema.ts": "export const schema = 1;",
        "src/scratch.tmp.ts": "export const t = 1;",
      },
      onTestFinished,
    );

    expect(await paths(root)).toEqual(["src/index.ts"]);
  });

  it("respects a nested .gitignore, scoped to its own directory", async () => {
    const root = await makeTmpRepo(
      {
        "packages/api/.gitignore": "codegen.ts\n",
        "packages/api/codegen.ts": "export const gen = 1;",
        "packages/api/handler.ts": "export const handler = 1;",
        "packages/web/codegen.ts": "export const gen = 1;",
      },
      onTestFinished,
    );

    expect(await paths(root)).toEqual(["packages/api/handler.ts", "packages/web/codegen.ts"]);
  });

  it("can be told to ignore .gitignore entirely", async () => {
    const root = await makeTmpRepo(
      {
        ".gitignore": "generated/\n",
        "src/index.ts": "export const a = 1;",
        "generated/schema.ts": "export const schema = 1;",
      },
      onTestFinished,
    );

    expect(await paths(root, { respectGitignore: false })).toEqual([
      "generated/schema.ts",
      "src/index.ts",
    ]);
  });

  it("applies caller-supplied exclude patterns", async () => {
    const root = await makeTmpRepo(
      {
        "src/index.ts": "export const a = 1;",
        "scripts/deploy.ts": "export const deploy = 1;",
      },
      onTestFinished,
    );

    expect(await paths(root, { exclude: ["**/scripts/**"] })).toEqual(["src/index.ts"]);
  });

  it("skips files above the size limit", async () => {
    const root = await makeTmpRepo(
      {
        "src/small.ts": "export const a = 1;",
        "src/huge.ts": `export const big = "${"x".repeat(5000)}";`,
      },
      onTestFinished,
    );

    expect(await paths(root, { maxFileBytes: 1000 })).toEqual(["src/small.ts"]);
  });

  it("classifies files by role without excluding them", async () => {
    const root = await makeTmpRepo(
      {
        "src/index.ts": "export const a = 1;",
        "src/index.test.ts": "it('works', () => {});",
        "bench/parse.ts": "export const b = 1;",
        "examples/basic.ts": "export const c = 1;",
        "scripts/seed.ts": "export const d = 1;",
      },
      onTestFinished,
    );

    const files = await walk(root);

    expect(files.map((f) => `${f.path}:${f.role}`)).toEqual([
      "bench/parse.ts:benchmark",
      "examples/basic.ts:example",
      "scripts/seed.ts:script",
      "src/index.test.ts:test",
      "src/index.ts:source",
    ]);
  });

  it("reports language and byte size per file", async () => {
    const root = await makeTmpRepo({ "app/main.py": "x = 1\n" }, onTestFinished);

    const [file] = await walk(root);

    expect(file).toMatchObject({
      path: "app/main.py",
      language: "python",
      bytes: 6,
      role: "source",
    });
  });
});
