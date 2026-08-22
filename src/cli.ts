#!/usr/bin/env node
import { Command } from "commander";
import { runAnalyzers } from "./analyze/index.js";
import { walk } from "./discover/walk.js";
import { buildIndex } from "./index/build.js";
import { renderTerminalReport } from "./report/terminal.js";

const program = new Command();

program
  .name("aicc")
  .description("Measure how much slop a codebase is carrying, from an AI agent's point of view.")
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

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              root: index.root,
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

      process.stdout.write(renderTerminalReport(index, results, { detail: options.detail }));
    },
  );

await program.parseAsync();
