import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';

export interface SourceDependency {
  from: string;
  to: string;
  specifier: string;
  typeOnly: boolean;
}

export function readCompilerOptions(root: string): ts.CompilerOptions {
  const config = ts.readConfigFile(resolve(root, 'tsconfig.json'), (file) => ts.sys.readFile(file));
  if (config.error) {
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length) {
    throw new Error(
      parsed.errors
        .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
        .join('\n'),
    );
  }
  return parsed.options;
}

export function readSourceDependencies(
  root: string,
  file: string,
  source: string,
  options: ts.CompilerOptions,
): SourceDependency[] {
  const dependencies: SourceDependency[] = [];
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

  function add(literal: ts.Node, typeOnly = false) {
    if (!ts.isStringLiteralLike(literal)) {
      return;
    }
    const specifier = literal.text;
    if (!specifier.startsWith('~/') && !specifier.startsWith('.')) {
      return;
    }
    // Asset imports are handled by Vite, not the TypeScript source graph.
    if (/\.(css|svg|png|jpg|webp)(?:\?|$)/.test(specifier)) {
      return;
    }
    const target = ts.resolveModuleName(
      specifier,
      resolve(root, file),
      options,
      ts.sys,
    ).resolvedModule;
    if (!target) {
      throw new Error(`Unresolved local import: ${file} -> ${specifier}`);
    }
    const to = relative(root, target.resolvedFileName).replaceAll('\\', '/');
    if (to.startsWith('app/')) {
      dependencies.push({ from: file, to, specifier, typeOnly });
    }
  }

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const namedTypes =
        !clause?.name &&
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.length > 0 &&
        bindings.elements.every((binding) => binding.isTypeOnly);
      add(node.moduleSpecifier, Boolean(clause?.isTypeOnly || namedTypes));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const clause = node.exportClause;
      const namedTypes =
        clause &&
        ts.isNamedExports(clause) &&
        clause.elements.length > 0 &&
        clause.elements.every((binding) => binding.isTypeOnly);
      add(node.moduleSpecifier, Boolean(node.isTypeOnly || namedTypes));
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0
    ) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }

  visit(parsed);
  return dependencies;
}

export function readAppDependencies(root: string): SourceDependency[] {
  const options = readCompilerOptions(root);

  function walk(directory: string): string[] {
    return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        return walk(file);
      }
      return /\.tsx?$/.test(file) && !/\.(test|spec)\.tsx?$/.test(file) ? [file] : [];
    });
  }

  return walk('app').flatMap((file) =>
    readSourceDependencies(root, file, readFileSync(resolve(root, file), 'utf8'), options),
  );
}
