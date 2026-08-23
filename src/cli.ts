#!/usr/bin/env node
import { Command } from "commander";
import { runAnalyzers } from "./analyze/index.js";
import { walk } from "./discover/walk.js";
import { buildIndex } from "./index/build.js";
import { renderTerminalReport } from "./report/terminal.js";
import { scoreIndex } from "./score/score.js";

const program = new Command();

program
  .name("aicc")
  .description(
    "AI Code Complexity — measure how much slop a codebase is carrying, from an AI agent's point of view.",
  )
  .version("0.0.1");

program
  .command("scan", { isDefault: true })
  .description("Scan a codebase and report its agent-navigability metrics")
  .argument("[path]", "path to scan", ".")
  .option("--json", "emit machine-readable JSON")
  .option("--detail <n>", "findings to show per metric", (value) => Number.parseInt(value, 10), 3)
  .option("--exclude <glob...>", "additional glob patterns to exclude")
  .action(
    async (
      target: string,
      options: { json?: boolean; detail: number; exclude?: string[] },
    ) => {
      const files = await walk(target, options.exclude ? { exclude: options.exclude } : {});
      const index = await buildIndex(target, files);
      const results = runAnalyzers(index);
      const score = scoreIndex(index, results);

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              root: index.root,
              slopScore: score.score,
              grade: score.grade,
              base: score.base,
              size: score.size,
              pillars: score.pillars,
              files: index.files.size,
              symbols: index.symbols.size,
              imports: index.imports.length,
              calls: index.calls.length,
              failures: index.failures,
              metrics: results,
            },
            null,
            2,
          ),
        );
        return;
      }

      process.stdout.write(renderTerminalReport(index, results, score, { detail: options.detail }));
    },
  );

await program.parseAsync();
