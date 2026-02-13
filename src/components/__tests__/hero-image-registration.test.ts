import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as ts from "typescript";

interface RegistrationEffectCheck {
  dependencies: string[];
  registerCallbackUsesRef: boolean;
}

function findRegisterGenerateEffect(sourceFile: ts.SourceFile): RegistrationEffectCheck | null {
  let result: RegistrationEffectCheck | null = null;

  function visit(node: ts.Node) {
    if (result) return;

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "useEffect" &&
      node.arguments.length >= 2 &&
      (ts.isArrowFunction(node.arguments[0]) || ts.isFunctionExpression(node.arguments[0])) &&
      ts.isArrayLiteralExpression(node.arguments[1])
    ) {
      const effectCallback = node.arguments[0];
      const dependencies = node.arguments[1].elements
        .filter(ts.isIdentifier)
        .map((dep) => dep.text);

      let registerCallbackUsesRef = false;
      let hasRegisterGenerateCall = false;

      if (ts.isBlock(effectCallback.body)) {
        for (const statement of effectCallback.body.statements) {
          if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) {
            continue;
          }
          const expr = statement.expression;
          if (!ts.isIdentifier(expr.expression) || expr.expression.text !== "registerGenerate") {
            continue;
          }
          hasRegisterGenerateCall = true;
          const [registerArg] = expr.arguments;
          if (registerArg) {
            const registerArgText = registerArg.getText(sourceFile);
            registerCallbackUsesRef = registerArgText.includes("handleManualRegenerateRef.current?.()");
          }
        }
      }

      if (hasRegisterGenerateCall) {
        result = { dependencies, registerCallbackUsesRef };
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return result;
}

describe("HeroImage generate registration", () => {
  it("uses a stable effect dependency list and ref-backed callback", () => {
    const filePath = path.resolve(process.cwd(), "src/components/hero-image.tsx");
    const source = readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );

    const check = findRegisterGenerateEffect(sourceFile);
    expect(check).not.toBeNull();

    expect(check!.dependencies).toEqual(["registerGenerate", "unregisterGenerate"]);
    expect(check!.dependencies).not.toContain("handleManualRegenerate");
    expect(check!.registerCallbackUsesRef).toBe(true);
  });
});
