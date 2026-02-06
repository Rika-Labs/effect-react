import MagicString, { type SourceMap } from "magic-string";
import * as ts from "typescript";

interface Replacement {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const getNodeText = (source: string, node: ts.Node, file: ts.SourceFile): string =>
  source.slice(node.getStart(file), node.getEnd());

const getActionNameFromInitializer = (initializer: ts.Expression): string | undefined => {
  if (!ts.isCallExpression(initializer)) {
    return undefined;
  }
  if (
    !ts.isIdentifier(initializer.expression) ||
    initializer.expression.text !== "defineServerAction"
  ) {
    return undefined;
  }

  const firstArg = initializer.arguments[0];
  if (firstArg === undefined || !ts.isObjectLiteralExpression(firstArg)) {
    return undefined;
  }

  for (const property of firstArg.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    if (!ts.isIdentifier(property.name) || property.name.text !== "name") {
      continue;
    }
    const value = property.initializer;
    if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
      return value.text;
    }
  }

  return undefined;
};

const collectActionBindings = (file: ts.SourceFile): Readonly<Record<string, string>> => {
  const bindings: Record<string, string> = {};

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined
    ) {
      const actionName = getActionNameFromInitializer(node.initializer);
      if (actionName !== undefined) {
        bindings[node.name.text] = actionName;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(file);
  return bindings;
};

const collectActionCallReplacements = (
  source: string,
  file: ts.SourceFile,
  bindings: Readonly<Record<string, string>>,
): readonly Replacement[] => {
  const replacements: Replacement[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "callServerAction"
    ) {
      const transportArg = node.arguments[0];
      const actionArg = node.arguments[1];
      const inputArg = node.arguments[2];
      const optionsArg = node.arguments[3];

      if (
        transportArg === undefined ||
        actionArg === undefined ||
        inputArg === undefined ||
        !ts.isIdentifier(actionArg)
      ) {
        ts.forEachChild(node, visit);
        return;
      }

      const actionName = bindings[actionArg.text];
      if (actionName === undefined) {
        ts.forEachChild(node, visit);
        return;
      }

      const transport = getNodeText(source, transportArg, file);
      const input = getNodeText(source, inputArg, file);
      const options = optionsArg === undefined ? undefined : getNodeText(source, optionsArg, file);

      const replacement =
        options === undefined
          ? `callServerActionByName(${transport}, ${JSON.stringify(actionName)}, ${input}, undefined, ${actionArg.text}.errorCodec)`
          : `callServerActionByName(${transport}, ${JSON.stringify(actionName)}, ${input}, ${options}, ${actionArg.text}.errorCodec)`;

      replacements.push({
        start: node.getStart(file),
        end: node.getEnd(),
        text: replacement,
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(file);
  return replacements;
};

const collectImportInsertion = (file: ts.SourceFile): Replacement | undefined => {
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }
    if (!ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (!/server/.test(statement.moduleSpecifier.text)) {
      continue;
    }

    const importClause = statement.importClause;
    if (importClause === undefined || importClause.namedBindings === undefined) {
      continue;
    }
    if (!ts.isNamedImports(importClause.namedBindings)) {
      continue;
    }

    const elements = importClause.namedBindings.elements;
    const hasCallServerAction = elements.some((element) => {
      const imported = element.propertyName?.text ?? element.name.text;
      return imported === "callServerAction";
    });
    if (!hasCallServerAction) {
      continue;
    }

    const hasCallServerActionByName = elements.some((element) => {
      const imported = element.propertyName?.text ?? element.name.text;
      return imported === "callServerActionByName";
    });
    if (hasCallServerActionByName) {
      return undefined;
    }

    const insertionPoint = importClause.namedBindings.getEnd() - 1;
    const prefix = elements.length === 0 ? "" : ", ";
    return {
      start: insertionPoint,
      end: insertionPoint,
      text: `${prefix}callServerActionByName`,
    };
  }

  return undefined;
};

const applyReplacementsWithMap = (
  source: string,
  replacements: readonly Replacement[],
  fileName: string,
): { readonly code: string; readonly map: SourceMap } => {
  const magic = new MagicString(source);
  const sorted = [...replacements].sort((left, right) => right.start - left.start);
  for (const replacement of sorted) {
    if (replacement.start === replacement.end) {
      magic.appendLeft(replacement.start, replacement.text);
    } else {
      magic.overwrite(replacement.start, replacement.end, replacement.text);
    }
  }
  return {
    code: magic.toString(),
    map: magic.generateMap({
      hires: true,
      includeContent: true,
      source: fileName,
      file: fileName,
    }),
  };
};

export const transformServerActionCallsAstWithMap = (
  source: string,
  fileName = "effect-react-transform.tsx",
): { readonly code: string; readonly map: SourceMap } | null => {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const bindings = collectActionBindings(file);
  if (Object.keys(bindings).length === 0) {
    return null;
  }

  const callReplacements = collectActionCallReplacements(source, file, bindings);
  if (callReplacements.length === 0) {
    return null;
  }

  const importInsertion = collectImportInsertion(file);
  const replacements =
    importInsertion === undefined ? callReplacements : [...callReplacements, importInsertion];
  return applyReplacementsWithMap(source, replacements, fileName);
};

export const transformServerActionCallsAst = (source: string): string => {
  const transformed = transformServerActionCallsAstWithMap(source);
  return transformed === null ? source : transformed.code;
};
