#!/usr/bin/env node
import { Command } from "commander";

import { runAnalyzers } from "./analyze/index.js";
import { DEFAULT_LCOV_PATH, readLcov } from "./discover/lcov.js";
import { walk } from "./discover/walk.js";
import { buildIndex } from "./index/build.js";
import { renderFinding } from "./report/describe.js";
import { renderTerminalReport } from "./report/terminal.js";
import { scoreIndex } from "./score/score.js";

const program = new Command();

program
  .name("aicomplex")
  .description(
    "AI Code Complexity — measure how much slop a codebase is carrying, from an AI agent's point of view."
  )
  .version("0.0.1");

program
  .command("scan", { isDefault: true })
  .description("Scan a codebase and report its agent-navigability metrics")
  .argument("[path]", "path to scan", ".")
  .option("--json", "emit machine-readable JSON")
  .option(
    "--detail <n>",
    "findings to show per metric",
    (value) => Math.trunc(Number(value)),
    3
  )
  .option("--exclude <glob...>", "additional glob patterns to exclude")
  .option("--why", "explain the threshold behind each metric")
  .option(
    "--lcov <path>",
    "lcov report to read coverage from",
    DEFAULT_LCOV_PATH
  )
  .action(
    async (
      target: string,
      options: {
        json?: boolean;
        detail: number;
        exclude?: string[];
        why?: boolean;
        lcov: string;
      }
    ) => {
      const files = await walk(
        target,
        options.exclude ? { exclude: options.exclude } : {}
      );
      const coverage = await readLcov(target, options.lcov);
      const index = await buildIndex(target, files, coverage);
      const results = runAnalyzers(index);
      const score = scoreIndex(index, results);

      if (options.json === true) {
        console.log(
          JSON.stringify(
            {
              base: score.base,
              calls: index.calls.length,
              coverage:
                coverage === null
                  ? null
                  : { files: coverage.size, lcov: options.lcov },
              failures: index.failures,
              files: index.files.size,
              grade: score.grade,
              imports: index.imports.length,
              metrics: results.map((result) => ({
                ...result,
                // Findings cross the seam as data; the sentence is derived
                // here so a consumer can use either without re-implementing
                // aicomplex's wording.
                findings: result.findings.map((finding) => ({
                  ...finding,
                  message: renderFinding(finding),
                })),
              })),
              pillars: score.pillars,
              root: index.root,
              size: score.size,
              slopScore: score.score,
              symbols: index.symbols.size,
            },
            null,
            2
          )
        );
        return;
      }

      process.stdout.write(
        renderTerminalReport(index, results, score, {
          detail: options.detail,
          why: options.why === true,
        })
      );
    }
  );

await program.parseAsync();
