import type { AnalyzerResult, Pillar } from "../analyze/types.js";
import { PILLARS } from "../analyze/types.js";
import type { CodeIndex } from "../index/types.js";

const PILLAR_TITLES: Record<Pillar, string> = {
  findability: "Findability — can an agent locate things?",
  traceability: "Traceability — can an agent follow a change?",
  "context-cost": "Context cost — how much must it read?",
  slop: "Slop signals — the AI tells",
};

const useColour = process.stdout.isTTY === true && !process.env["NO_COLOR"];

const dim = (s: string) => (useColour ? `[2m${s}[0m` : s);
const bold = (s: string) => (useColour ? `[1m${s}[0m` : s);

export type ReportOptions = {
  /** Findings shown per analyzer. */
  detail?: number;
};

export function renderTerminalReport(
  index: CodeIndex,
  results: AnalyzerResult[],
  options: ReportOptions = {},
): string {
  const { detail = 3 } = options;
  const lines: string[] = [""];

  lines.push(`  ${bold(index.root)}`);
  lines.push(
    dim(
      `  ${index.files.size} files · ${index.symbols.size} symbols · ` +
        `${index.imports.length} imports · ${index.calls.length} calls`,
    ),
  );
  lines.push("");

  for (const pillar of PILLARS) {
    const forPillar = results.filter((result) => result.pillar === pillar);
    if (forPillar.length === 0) continue;

    lines.push(`  ${bold(PILLAR_TITLES[pillar])}`);
    lines.push("");

    for (const result of forPillar) {
      lines.push(
        `    ${result.metric.toFixed(1).padStart(5)}  ${result.analyzer.padEnd(24)} ${dim(result.unit)}`,
      );
      for (const finding of result.findings.slice(0, detail)) {
        lines.push(dim(`           ${finding.message}`));
      }
      const hidden = result.findings.length - detail;
      if (hidden > 0) lines.push(dim(`           …and ${hidden} more`));
      lines.push("");
    }
  }

  if (index.failures.length > 0) {
    lines.push(`  ${bold(`Could not parse ${index.failures.length} file(s)`)}`);
    for (const failure of index.failures.slice(0, 5)) {
      lines.push(dim(`    ${failure.path} — ${failure.reason}`));
    }
    lines.push("");
  }

  // Deliberate: a single headline number is meaningless until the metrics are
  // calibrated against a reference corpus. Reporting one now would be an
  // opinion dressed as data.
  lines.push(dim("  Metrics are uncalibrated — compare repos, not the absolute numbers."));
  lines.push("");

  return lines.join("\n");
}
