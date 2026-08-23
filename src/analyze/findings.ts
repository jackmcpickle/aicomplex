import type { DefinitionKind, SmellKind } from "../parse/language-pack.js";

/**
 * What an analyzer found, as data.
 *
 * Findings used to cross this seam as finished English sentences, which meant
 * `--json` handed machines prose and every analyzer carried string-building it
 * had no business owning. The wording now lives in one place —
 * `src/report/describe.ts` — and this module is the contract between them.
 *
 * Adding a variant without teaching the renderer about it is a compile error,
 * which is the point.
 */

/** Fields every finding carries, whatever its kind. */
type Located = {
  file?: string;
  line?: number;
  symbol?: string;
  /**
   * Relative importance within one analyzer's findings. Used only to rank and
   * cap them; the score comes from the metric, never from summing findings.
   */
  weight: number;
};

export type Finding = Located &
  (
    | { kind: "ambiguous-name"; name: string; definitions: number; files: number }
    | { kind: "orphan"; loc: number }
    | { kind: "barrel"; uses: number; chain: number }
    | { kind: "cycle"; members: string[] }
    | { kind: "reimplemented"; names: string[]; alsoDefinedIn: number }
    | { kind: "large-file"; loc: number; bytes: number }
    | { kind: "hard-function"; complexity: number; maxDepth: number; lines: number }
    | { kind: "duplicate-body"; copies: number; lines: number; files: number; names: string[] }
    | { kind: "masked-errors"; smell: SmellKind; count: number }
    | { kind: "worst-masking-file"; count: number }
    | { kind: "dead-export"; definition: DefinitionKind }
    | { kind: "crap-function"; crap: number; complexity: number; coverage: number }
    | {
        kind: "crap-bands";
        functions: number;
        over5: number;
        over15: number;
        over30: number;
      }
    | { kind: "coverage-missing" }
  );

export type FindingKind = Finding["kind"];
