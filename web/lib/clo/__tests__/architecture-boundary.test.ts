/**
 * Architecture-boundary AST enforcement.
 *
 * Forbids the specific UI re-derivation patterns that caused the April 2026
 * "missing €1.80M of interest residual" incident. Each rule encodes one
 * incident-pattern; per-occurrence opt-out via inline `// arch-boundary-allow: <ruleId>`.
 *
 * See CLAUDE.md § Engine ↔ UI separation.
 */

import { Project, SyntaxKind, Node } from "ts-morph";
import { describe, expect, it } from "vitest";
import { resolve } from "path";

const TSCONFIG_PATH = resolve(__dirname, "../../../tsconfig.json");

const ARITHMETIC_TOKENS = new Set<SyntaxKind>([
  SyntaxKind.AsteriskToken,
  SyntaxKind.SlashToken,
  SyntaxKind.PlusToken,
  SyntaxKind.MinusToken,
]);

function expressionContainsMember(node: Node, owner: string, member: string): boolean {
  let found = false;
  node.forEachDescendant((d) => {
    if (Node.isPropertyAccessExpression(d)) {
      const parent = d.getExpression();
      if (Node.isIdentifier(parent) && parent.getText() === owner && d.getName() === member) {
        found = true;
      }
    }
  });
  return found;
}

function expressionContainsAnyMember(node: Node, owner: string): boolean {
  let found = false;
  node.forEachDescendant((d) => {
    if (Node.isPropertyAccessExpression(d)) {
      const parent = d.getExpression();
      if (Node.isIdentifier(parent) && parent.getText() === owner) found = true;
    }
  });
  return found;
}

interface Rule {
  id: string;
  scope: RegExp;
  detect: (node: Node) => boolean;
  rationale: string;
}

const RULES: Rule[] = [
  {
    id: "ui-uses-inputs-in-arithmetic",
    scope: /web\/(app|components)\/clo\/.*\.(ts|tsx)$/,
    detect: (node) => {
      if (!Node.isBinaryExpression(node)) return false;
      if (!ARITHMETIC_TOKENS.has(node.getOperatorToken().getKind())) return false;
      return expressionContainsAnyMember(node, "inputs");
    },
    rationale:
      "Arithmetic involving inputs.<member> in a UI helper. Read from period.stepTrace.* instead.",
  },
  {
    id: "ui-back-derives-equity",
    scope: /web\/(app|components)\/clo\/.*\.(ts|tsx)$/,
    detect: (node) => {
      if (!Node.isBinaryExpression(node)) return false;
      if (node.getOperatorToken().getKind() !== SyntaxKind.MinusToken) return false;
      return expressionContainsMember(node, "period", "equityDistribution");
    },
    rationale:
      "Back-derivation from period.equityDistribution. Read period.stepTrace.equityFromInterest / equityFromPrincipal directly.",
  },
  {
    id: "ui-reads-raw-principal-cash",
    scope: /web\/(app|components)\/clo\/.*\.(ts|tsx)$/,
    detect: (node) => {
      if (!Node.isBinaryExpression(node)) return false;
      if (!ARITHMETIC_TOKENS.has(node.getOperatorToken().getKind())) return false;
      return expressionContainsMember(node, "resolved", "principalAccountCash");
    },
    rationale:
      "Reading raw resolver field with sign-convention invariant in arithmetic. Use result.initialState.equityBookValue (engine output) instead.",
  },
  {
    id: "ui-recomputes-book-value",
    scope: /web\/(app|components)\/clo\/.*\.(ts|tsx)$/,
    detect: (node) => {
      if (!Node.isCallExpression(node)) return false;
      const expr = node.getExpression();
      if (!Node.isPropertyAccessExpression(expr)) return false;
      if (expr.getExpression().getText() !== "Math" || expr.getName() !== "max") return false;
      const args = node.getArguments();
      if (args.length !== 2) return false;
      const text = args[1].getText();
      return /loans?\b/i.test(text) && /\bdebt\b/i.test(text);
    },
    rationale:
      "UI re-deriving equity book value. Read from result.initialState.equityBookValue.",
  },
  {
    // Catches hardcoded currency symbols in partner-facing UI. Per CLAUDE.md
    // principle 1 (don't overfit a single deal). Use useFormatAmount()
    // inside a DealCurrencyProvider tree, or formatAmount(val, currency)
    // with currency threaded explicitly.
    //
    // Detection narrowed to the actual bug shape (symbol adjacent to a
    // rendering context) rather than every occurrence of the chars, because
    // `$` collides with JS template substitution syntax `${...}`, SQL
    // parameter placeholders `$1`, and regex char classes `[$.]`. We flag:
    //   - €/£/¥ in any rendered string/JSX (no other meaning in code)
    //   - `$` ONLY when it's the entire content of a JSX-rendered string
    //     literal, the leading char before a `${expr}` substitution
    //     (TemplateHead = "$"), or directly preceding `{` in JsxText.
    // Legitimate uses (currencySymbol mapping table, documentation prose,
    // input placeholders, SQL params) opt out via arch-boundary-allow comment.
    id: "ui-hardcodes-currency-symbol",
    scope: /web\/(app|components)\/clo\/.*\.(ts|tsx)$/,
    detect: (node) => {
      const UNAMBIGUOUS = /[€£¥]/;
      // For `$`: only flag when it's the trailing char of a template-head
      // (i.e. `\`$${val}…\``) or when the entire literal is just `$`.
      const dollarBugShape = (text: string): boolean =>
        text.endsWith("$") || text === "$";
      if (Node.isJsxText(node)) {
        const t = node.getText();
        return UNAMBIGUOUS.test(t) || /\$\{/.test(t);
      }
      if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
        const t = node.getLiteralText();
        return UNAMBIGUOUS.test(t) || dollarBugShape(t);
      }
      if (Node.isTemplateHead(node) || Node.isTemplateMiddle(node) || Node.isTemplateTail(node)) {
        const t = node.getLiteralText();
        return UNAMBIGUOUS.test(t) || dollarBugShape(t);
      }
      return false;
    },
    rationale:
      "Hardcoded currency symbol in UI. Use useFormatAmount() or formatAmount(val, currency) with currency from useDealCurrency()/resolved.currency. Add `// arch-boundary-allow: ui-hardcodes-currency-symbol` for legitimate uses (symbol mapping, documentation prose, input placeholders).",
  },
];

function hasAllowComment(node: Node, ruleId: string): boolean {
  const sourceFile = node.getSourceFile();
  const lines = sourceFile.getFullText().split("\n");
  const nodeLine = node.getStartLineNumber() - 1;
  const marker = new RegExp(`arch-boundary-allow:\\s*${ruleId}\\b`);
  for (let i = nodeLine - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line === "") continue;
    if (line.startsWith("//")) {
      if (marker.test(line)) return true;
      continue;
    }
    return false;
  }
  return false;
}

describe("UI does not re-derive engine values", () => {
  it("no AST violations under scoped UI files", () => {
    const project = new Project({ tsConfigFilePath: TSCONFIG_PATH });
    const violations: string[] = [];
    for (const rule of RULES) {
      const files = project.getSourceFiles().filter((f) => rule.scope.test(f.getFilePath()));
      for (const file of files) {
        file.forEachDescendant((node) => {
          if (rule.detect(node) && !hasAllowComment(node, rule.id)) {
            violations.push(
              `${file.getFilePath()}:${node.getStartLineNumber()} [${rule.id}] ${rule.rationale}`,
            );
          }
        });
      }
    }
    expect(violations).toEqual([]);
  });
});
