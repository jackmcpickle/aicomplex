import type { Finding } from "../analyze/findings.js";
import type { SmellKind } from "../parse/language-pack.js";

/**
 * Every sentence aicomplex says about a finding.
 *
 * Kept in one file so the tool's voice can be read top to bottom, and so
 * rewording never touches an analyzer. The switch is exhaustive: a new
 * `Finding` variant fails to compile until it has a line here.
 */
export function renderFinding(finding: Finding): string {
  switch (finding.kind) {
    case "ambiguous-name": {
      return `"${finding.name}" is defined ${finding.definitions} times across ${finding.files} files`;
    }

    case "orphan": {
      return `nothing imports ${finding.file} (${finding.loc} lines)`;
    }

    case "barrel": {
      const depth =
        finding.chain > 1 ? `, ${finding.chain} re-exports deep` : "";
      return `${finding.file} is a barrel used by ${finding.uses} import(s)${depth}`;
    }

    case "cycle": {
      const trail = finding.members.length > 4 ? " → …" : "";
      return `${finding.members.length} files form an import cycle: ${finding.members.slice(0, 4).join(" → ")}${trail}`;
    }

    case "reimplemented": {
      const extras =
        finding.names.length > 3 ? ` and ${finding.names.length - 3} more` : "";
      const names = finding.names
        .slice(0, 3)
        .map((name) => `${name}()`)
        .join(", ");
      return `${finding.file} calls its own ${names}${extras} — also defined in ${finding.alsoDefinedIn} other file(s)`;
    }

    case "large-file": {
      return `${finding.file} is ${finding.loc} lines — roughly ${tokens(finding.bytes)} tokens to read`;
    }

    case "hard-function": {
      return `${finding.symbol} has complexity ${finding.complexity} and nests ${finding.maxDepth} deep over ${finding.lines} lines`;
    }

    case "duplicate-body": {
      const more = finding.names.length > 3 ? ", …" : "";
      return `${finding.copies} copies of the same ${finding.lines}-line body across ${finding.files} file(s): ${finding.names.slice(0, 3).join(", ")}${more}`;
    }

    case "masked-errors": {
      return `${finding.count} × ${SMELLS[finding.smell]}`;
    }

    case "worst-masking-file": {
      return `worst file: ${finding.file} with ${finding.count}`;
    }

    case "dead-export": {
      return `${finding.symbol} (${finding.definition}) is exported but never used`;
    }

    case "crap-bands": {
      return (
        `${finding.functions} covered functions — ` +
        `${finding.over5.toFixed(0)}% over 5, ` +
        `${finding.over15.toFixed(0)}% over 15, ` +
        `${finding.over30.toFixed(0)}% over 30`
      );
    }

    case "crap-function": {
      return (
        `${finding.symbol} scores ${finding.crap.toFixed(0)} ` +
        `(complexity ${finding.complexity}, ${finding.coverage.toFixed(0)}% covered)`
      );
    }

    case "coverage-missing": {
      return "no coverage data — run your tests with an lcov reporter first, e.g. vitest run --coverage";
    }

    default: {
      const _exhaustive: never = finding;
      return _exhaustive;
    }
  }
}

const SMELLS: Record<SmellKind, string> = {
  "any-type": "`any`, which switches off type checking locally",
  "bare-except": "except clause whose body only passes",
  "empty-catch": "catch block that discards the error",
  "ignore-comment": "comment disabling a linter or type check",
};

/** Rough token count. ~3.5 bytes per token is close enough for code. */
function tokens(bytes: number): string {
  const count = Math.round(bytes / 3.5);
  return count > 1000 ? `${(count / 1000).toFixed(1)}k` : `${count}`;
}
