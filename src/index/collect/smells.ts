import type { Node, Tree } from "web-tree-sitter";

import { isSmellKind } from "../../parse/language-pack.js";
import type { SmellKind } from "../../parse/language-pack.js";
import type { CompiledLanguage } from "../../parse/parser.js";
import type { Smell } from "../types.js";
import { splitCaptureName } from "./shared.js";

export function collectSmells(
  compiled: CompiledLanguage,
  tree: Tree,
  filePath: string
): Smell[] {
  const smells: Smell[] = [];

  for (const capture of compiled.queries.smells.captures(tree.rootNode)) {
    const [prefix, kind] = splitCaptureName(capture.name);
    if (prefix !== "smell" || kind === undefined || !isSmellKind(kind)) {
      continue;
    }
    if (!validateSmell(kind, capture.node)) {
      continue;
    }

    smells.push({
      file: filePath,
      kind,
      line: capture.node.startPosition.row + 1,
      text: capture.node.text.slice(0, 120).replaceAll(/\s+/gu, " ").trim(),
    });
  }

  return smells;
}

const IGNORE_COMMENT =
  /eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck|type:\s*ignore|noqa|nolint|pylint:\s*disable|prettier-ignore|istanbul ignore|c8 ignore/iu;

/**
 * Decides whether a captured node is really a smell.
 *
 * The queries cannot express "empty" or "says ignore", so they capture every
 * candidate and the judgement happens here.
 */
function validateSmell(kind: SmellKind, node: Node): boolean {
  switch (kind) {
    case "empty-catch": {
      // A catch block with nothing in it discards the error entirely.
      return (
        node.namedChildren.filter((child) => child?.type !== "comment")
          .length === 0
      );
    }

    case "bare-except": {
      // `except:` or `except Exception:` whose body only passes. The block is
      // a plain named child — except_clause has no `body` field.
      const block = node.namedChildren.find((child) => child?.type === "block");
      const statements =
        block?.namedChildren.filter((child) => child?.type !== "comment") ?? [];
      return (
        statements.length === 1 && statements[0]?.type === "pass_statement"
      );
    }

    case "ignore-comment": {
      return IGNORE_COMMENT.test(node.text);
    }

    case "any-type": {
      return node.text === "any";
    }

    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
