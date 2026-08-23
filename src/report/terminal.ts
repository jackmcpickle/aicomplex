import type { AnalyzerResult, Pillar } from "../analyze/types.js";
import { PILLARS } from "../analyze/types.js";
import { FILE_ROLES, SCORED_ROLES } from "../discover/role.js";
import { scoredFiles } from "../index/scope.js";
import { renderFinding } from "./describe.js";
import type { CodeIndex } from "../index/types.js";
import type { SlopScore } from "../score/score.js";

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
  score: SlopScore,
  options: ReportOptions = {},
): string {
  const { detail = 3 } = options;
  const lines: string[] = [""];

  const scored = scoredFiles(index).length;

  lines.push(`  ${bold(index.root)}`);
  lines.push(
    dim(
      `  ${scored} scored files · ${index.symbols.size} symbols · ` +
        `${index.imports.length} imports · ${index.calls.length} calls`,
    ),
  );

  // Say plainly what was left out. A file count that silently differs from
  // what was measured is the kind of thing that makes a score untrustworthy.
  const excluded = FILE_ROLES.filter((role) => !SCORED_ROLES.has(role))
    .map((role) => ({ role, count: countByRole(index, role) }))
    .filter((entry) => entry.count > 0);

  if (excluded.length > 0) {
    lines.push(
      dim(`  not scored: ${excluded.map((e) => `${e.count} ${e.role}`).join(" · ")}`),
    );
  }
  lines.push("");
  lines.push(...renderScore(score));

  const pillarScores = new Map(score.pillars.map((entry) => [entry.pillar, entry.score]));

  for (const pillar of PILLARS) {
    const forPillar = results.filter((result) => result.pillar === pillar);
    if (forPillar.length === 0) continue;

    const pillarScore = pillarScores.get(pillar);
    const suffix = pillarScore === undefined ? "" : dim(`  ${pillarScore.toFixed(0)}/100`);
    lines.push(`  ${bold(PILLAR_TITLES[pillar])}${suffix}`);
    lines.push("");

    for (const result of forPillar) {
      lines.push(
        `    ${formatMetric(result.metric).padStart(6)}  ${result.analyzer.padEnd(24)} ${dim(result.unit)}`,
      );
      for (const finding of result.findings.slice(0, detail)) {
        lines.push(dim(`           ${renderFinding(finding)}`));
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

  // The thresholds behind the score are reasoned, not derived from a corpus.
  // Saying so is the difference between a useful comparison and a number
  // people mistake for a measurement.
  lines.push(dim("  Thresholds are reasoned, not corpus-derived — best used to compare repos"));
  lines.push(dim("  and to track one repo over time. See src/score/anchors.ts."));
  lines.push("");

  return lines.join("\n");
}

/** The headline block: score, grade, and how much of it is size. */
function renderScore(score: SlopScore): string[] {
  const bar = renderBar(score.score);
  const sign = score.size.adjustment >= 0 ? "+" : "";

  return [
    `  ${bold(`SLOP ${score.score.toFixed(0)}/100`)}  ${bold(score.grade)}   ${bar}`,
    dim(
      `  ${score.base.toFixed(0)} from metrics, ${sign}${score.size.adjustment.toFixed(0)} for size ` +
        `(${formatLoc(score.size.loc)} lines across ${score.size.files} files)`,
    ),
    "",
  ];
}

function renderBar(score: number): string {
  const width = 24;
  const filled = Math.round((score / 100) * width);
  return dim(`${"█".repeat(filled)}${"·".repeat(width - filled)}`);
}

/** Metrics are percentages, rates, or line counts, so precision has to vary. */
function formatMetric(value: number): string {
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

function formatLoc(loc: number): string {
  return loc >= 1000 ? `${(loc / 1000).toFixed(1)}k` : `${loc}`;
}

function countByRole(index: CodeIndex, role: string): number {
  let count = 0;
  for (const file of index.files.values()) if (file.role === role) count++;
  return count;
}
