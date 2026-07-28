/**
 * `@propertypro/shared` import-time purity guard.
 *
 * ## Why this exists
 *
 * `packages/shared/package.json` declares `"sideEffects": false`. That is a
 * promise to the bundler: *importing this package changes nothing, so any
 * export you do not use may be deleted entirely.* It bought −33.5 KiB on the
 * site-editor route, −135 KiB on mobile and −195 KiB on admin `/clients`.
 *
 * The promise is unenforced by the type system and unenforced by the test
 * suite. If someone later adds an import-time side effect — a global config
 * call, an `Object.freeze` sweep over a shared registry, a self-registering
 * map, a prototype patch — webpack is entitled to drop it, and it will:
 * silently, in production builds only. Vitest does not tree-shake, so every
 * unit test still passes. `next build` still succeeds. The failure appears as
 * behaviour that is simply missing at runtime, in prod, with no error.
 *
 * This guard makes that failure loud at lint time instead, which is the only
 * place it can be caught cheaply.
 *
 * ## What it checks
 *
 * Parses each file with the TypeScript AST rather than matching source text.
 * A regex over column-0 lines produces false positives on perfectly ordinary
 * code — `>;` closing a multi-line generic (`rbac-matrix.ts`,
 * `site/portfolio-template-branding.ts`) reads as a statement to a line-based
 * matcher but is not one. The AST knows the difference.
 *
 *   1. **Bare side-effect imports** — `import './register'`. The single most
 *      direct way to break the promise, and the only reason to write one.
 *   2. **Top-level non-declaration statements** — expression statements, `if`,
 *      `for`, `try`, `throw`, and friends at module scope. These run on import
 *      by definition.
 *   3. **Global and prototype mutation** — assignment through `globalThis` /
 *      `global` / `window` / `process.env`, assignment to a `.prototype.`
 *      member, or `Object.defineProperty`. These reach outside the module, so
 *      they are side effects wherever they appear, not only at top level —
 *      a function that patches a prototype is a landmine even if it is
 *      currently only called from one place.
 *
 * ## What it deliberately does NOT check
 *
 * Top-level `const x = f()` is allowed. Nearly every module here builds a Zod
 * schema at module scope (`const s = z.object({...})`), which is a call, and
 * banning it would ban the package. Such a call is pure with respect to other
 * modules: if the binding is dropped, the call goes with it and nothing
 * observable is lost. `Object.freeze({...})` on a value the module itself owns
 * is fine for the same reason — the checks above target reaching *outward*.
 *
 * `*.test.ts` files are skipped. They sit beside their sources in `site/` and
 * `site-diff/` rather than in `__tests__/`, they are not in the `tsup` entry
 * (`src/index.ts` / `src/server.ts`) so they are never bundled, and their
 * top-level `describe()` calls are expression statements that would otherwise
 * fail check 2 in every one of them.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** Repo root, resolved from this file rather than cwd. */
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const SHARED_SRC = join(REPO_ROOT, 'packages/shared/src');

export interface Violation {
  file: string;
  line: number;
  rule: 'bare-import' | 'top-level-statement' | 'global-mutation';
  detail: string;
}

/** Statement kinds that are pure declarations — no code runs on import. */
const DECLARATION_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.ImportDeclaration,
  ts.SyntaxKind.ImportEqualsDeclaration,
  ts.SyntaxKind.ExportDeclaration,
  ts.SyntaxKind.ExportAssignment,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.ModuleDeclaration,
  ts.SyntaxKind.VariableStatement,
  ts.SyntaxKind.EmptyStatement,
]);

/** Roots through which an assignment escapes the module. */
const GLOBAL_ROOTS = new Set(['globalThis', 'global', 'window', 'self', 'process']);

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/**
 * Strip the wrappers that carry no runtime meaning but do break a naive walk:
 * `(globalThis as any).x = 1` is the idiomatic way to write a global mutation
 * in TypeScript, and without this the chain stops at the parenthesis and the
 * assignment is missed. Covers parens, `as`, `<T>x`, `!` and `satisfies`.
 */
function unwrap(node: ts.Expression): ts.Expression {
  let current: ts.Expression = node;
  for (;;) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    return current;
  }
}

/** Leftmost identifier of a property-access chain: `a.b.c` -> `a`. */
function rootIdentifier(node: ts.Expression): string | null {
  let current: ts.Expression = unwrap(node);
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    current = unwrap(current.expression);
  }
  return ts.isIdentifier(current) ? current.text : null;
}

function isPrototypeTarget(node: ts.Expression): boolean {
  let current: ts.Expression = unwrap(node);
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    if (ts.isPropertyAccessExpression(current) && current.name.text === 'prototype') return true;
    current = unwrap(current.expression);
  }
  return false;
}

/**
 * Analyse one already-parsed source file. Exported so the unit test can drive
 * it with synthetic sources instead of fixture files on disk.
 */
export function findViolationsInSource(filePath: string, source: string): Violation[] {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.ESNext, true);
  const violations: Violation[] = [];

  // Checks 1 and 2 — module scope only.
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause === undefined) {
      violations.push({
        file: filePath,
        line: lineOf(sourceFile, statement),
        rule: 'bare-import',
        detail: `bare side-effect import ${statement.moduleSpecifier.getText(sourceFile)}`,
      });
      continue;
    }
    if (!DECLARATION_KINDS.has(statement.kind)) {
      violations.push({
        file: filePath,
        line: lineOf(sourceFile, statement),
        rule: 'top-level-statement',
        detail: `top-level ${ts.SyntaxKind[statement.kind]} runs on import`,
      });
    }
  }

  // Check 3 — anywhere in the file, including inside functions.
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const target = node.left;
      if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
        const root = rootIdentifier(target);
        if (root !== null && GLOBAL_ROOTS.has(root)) {
          violations.push({
            file: filePath,
            line: lineOf(sourceFile, node),
            rule: 'global-mutation',
            detail: `assignment through \`${root}\` escapes the module`,
          });
        } else if (isPrototypeTarget(target)) {
          violations.push({
            file: filePath,
            line: lineOf(sourceFile, node),
            rule: 'global-mutation',
            detail: 'prototype mutation',
          });
        }
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'defineProperty' &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'Object'
    ) {
      violations.push({
        file: filePath,
        line: lineOf(sourceFile, node),
        rule: 'global-mutation',
        detail: 'Object.defineProperty',
      });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);

  return violations;
}

/** `*.test.ts` / `*.test.tsx` are excluded — see the header. */
export function isCheckedFile(fileName: string): boolean {
  if (/\.test\.tsx?$/.test(fileName)) return false;
  if (/\.d\.ts$/.test(fileName)) return false;
  return /\.tsx?$/.test(fileName);
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (isCheckedFile(entry)) yield full;
  }
}

export function scanSharedPackage(root: string = SHARED_SRC): Violation[] {
  const violations: Violation[] = [];
  for (const file of walk(root)) {
    violations.push(
      ...findViolationsInSource(relative(REPO_ROOT, file), readFileSync(file, 'utf8')),
    );
  }
  return violations;
}

/**
 * Resolve the directory to scan.
 *
 * `--root <dir>` exists for the test suite, which must not plant fixture files
 * inside the real `packages/shared/src`: other guards' subprocess tests walk
 * that tree concurrently, and a file appearing and vanishing mid-walk makes
 * `readdirSync` and `readFileSync` disagree — an intermittent failure in an
 * unrelated test. Tests point at a temp directory instead.
 */
export function resolveScanRoot(argv: readonly string[]): string {
  const index = argv.indexOf('--root');
  const value = index === -1 ? undefined : argv[index + 1];
  return value === undefined ? SHARED_SRC : resolve(value);
}

function main(): void {
  const violations = scanSharedPackage(resolveScanRoot(process.argv.slice(2)));

  if (violations.length > 0) {
    console.error(
      `\n❌ @propertypro/shared declares "sideEffects": false, but ${violations.length} import-time side effect(s) were found:\n`,
    );
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.detail}`);
    }
    console.error(
      '\nEither remove the side effect, or drop "sideEffects": false from\n' +
        'packages/shared/package.json and accept the bundle-size regression\n' +
        '(~33 KiB site-editor / ~135 KiB mobile / ~195 KiB admin).\n' +
        'Leaving both in place ships a bundler promise the code does not keep:\n' +
        'webpack will drop the side effect in production builds only, and no\n' +
        'test will fail.\n',
    );
    process.exit(1);
  }

  console.log('✅ @propertypro/shared is import-time pure ("sideEffects": false holds).');
}

// Only run when invoked as a script. Without this, importing the module to unit
// test an exported check would execute main() and process.exit() out of the test
// runner.
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  main();
}
