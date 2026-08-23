import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { coverageOfSpan, readLcov } from "../../src/discover/lcov.js";
import { makeTmpRepo } from "../helpers/tmp-repo.js";

describe("readLcov", () => {
  it("returns null when there is no report", async () => {
    const root = await makeTmpRepo({ "src/a.ts": "export const a = 1;" }, onTestFinished);

    expect(await readLcov(root, "coverage/lcov.info")).toBeNull();
  });

  it("reads line hits per file", async () => {
    const root = await makeTmpRepo(
      {
        "coverage/lcov.info": "SF:src/a.ts\nDA:1,3\nDA:2,0\nend_of_record\n",
      },
      onTestFinished,
    );

    const coverage = await readLcov(root, "coverage/lcov.info");

    expect(coverage?.get("src/a.ts")).toEqual(new Map([[1, 3], [2, 0]]));
  });

  it("resolves absolute paths back into the scan", async () => {
    const root = await makeTmpRepo({ "src/a.ts": "export const a = 1;" }, onTestFinished);
    const abs = path.join(root, "src", "a.ts");

    await makeTmpRepo({}, onTestFinished); // keep the helper's cleanup honest

    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(path.join(root, "coverage"), { recursive: true });
    await writeFile(
      path.join(root, "coverage", "lcov.info"),
      `SF:${abs}\nDA:1,1\nend_of_record\n`,
      "utf8",
    );

    const coverage = await readLcov(root, "coverage/lcov.info");

    // Keyed by scan-relative posix path, not the absolute path from the report.
    expect([...coverage!.keys()]).toEqual(["src/a.ts"]);
  });

  it("keeps the highest hit count when reports are merged", async () => {
    const root = await makeTmpRepo(
      {
        "coverage/lcov.info":
          "SF:src/a.ts\nDA:1,0\nend_of_record\nSF:src/a.ts\nDA:1,4\nend_of_record\n",
      },
      onTestFinished,
    );

    const coverage = await readLcov(root, "coverage/lcov.info");

    expect(coverage?.get("src/a.ts")?.get(1)).toBe(4);
  });
});

describe("coverageOfSpan", () => {
  const hits = new Map([
    [10, 1],
    [11, 0],
    [12, 2],
    [20, 0],
  ]);

  it("counts only lines inside the span", () => {
    expect(coverageOfSpan(hits, 10, 12)).toBeCloseTo(66.667, 3);
  });

  it("is null when nothing in the span was instrumented", () => {
    expect(coverageOfSpan(hits, 30, 40)).toBeNull();
  });

  it("is null when the file is absent from the report", () => {
    expect(coverageOfSpan(undefined, 1, 10)).toBeNull();
  });

  it("distinguishes fully uncovered from unknown", () => {
    expect(coverageOfSpan(hits, 20, 20)).toBe(0);
  });
});
