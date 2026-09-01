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
 *      by definition. Class `static {}` initializer blocks count: the class is
 *      a `ClassDeclaration`, so statement kind alone waves it through while the
 *      block executes on import.
 *   3. **Global and prototype mutation** — assignment through `globalThis` /
 *      `global` / `window` / `process.env`, assignment to a `.prototype.`
 *      member, or `Object.defineProperty`. These reach outside the module, so
 *      they are side effects wherever they appear, not only at top level —
 *      a function that patches a prototype is a landmine even if it is
 *      currently only called from one place.
 *   4. **Mutation of an imported binding in a top-level initializer** —
 *      `const _ = REGISTRY.set('x', 1)`, `const _ = Object.freeze(IMPORTED)`.
 *      A declaration is not automatically inert, and wrapping the call in a
 *      `const` is the obvious way to slip a self-registering map past a check
 *      that only looks at statement kind.
 *
 * ## What it deliberately does NOT check, and the hole that leaves
 *
 * Top-level `const x = f()` is allowed in general. Nearly every module here
 * builds a Zod schema at module scope (`const s = z.object({...})`), which is
 * a call on an imported binding, and banning that shape would ban the package.
 * Such a call is pure with respect to other modules: if the binding is dropped
 * the call goes with it and nothing observable is lost. `Object.freeze({...})`
 * on a value the module itself owns is fine for the same reason — these checks
 * target reaching *outward*.
 *
 * So check 4 is a named-method allowlist (`set`/`add`/`push`/…, plus the
 * mutating `Object.*` statics), not "any call on an imported binding". That is
 * a deliberate trade: it catches the realistic registry-mutation shapes with no
 * false positives on Zod, and it will miss a side effect laundered through a
 * helper — `const _ = registerMe()` where `registerMe` is imported and mutates
 * internally is invisible here. Catching that needs type information, not a
 * syntax walk. This guard is a tripwire for the obvious cases, not a proof of
 * purity; do not read a passing run as one.
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
  rule: 'bare-import' | 'top-level-statement' | 'global-mutation' | 'imported-mutation';
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
 * Methods that mutate the receiver. Calling one of these on a binding that
 * came from another module IS an import-time side effect, even though the
 * whole thing sits inside a `const` — which is exactly how the naive
 * statement-kind check gets bypassed:
 *
 *     const _registered = REGISTRY.set('x', 1);
 *
 * `VariableStatement` is a declaration, so checks 1 and 2 wave it through
 * while the module mutates an imported map on import.
 */
const MUTATING_METHODS = new Set([
  'set', 'add', 'delete', 'clear',
  'push', 'pop', 'shift', 'unshift', 'splice',
  'sort', 'reverse', 'fill', 'copyWithin',
]);

/** `Object.*` helpers that mutate or seal their first argument. */
const MUTATING_OBJECT_STATICS = new Set([
  'freeze', 'assign', 'seal', 'defineProperty', 'defineProperties',
  'setPrototypeOf', 'preventExtensions',
]);

/** Names this module imported from elsewhere — i.e. things it does not own. */
function collectImportedBindings(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) continue;
    const clause = statement.importClause;
    if (clause.name) names.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
    else for (const element of bindings.elements) names.add(element.name.text);
  }
  return names;
}

/**
 * Does this call mutate something the module does not own?
 *
 * Deliberately a small allowlist of mutating method names rather than "any
 * call on an imported binding". Nearly every module here does
 * `const s = z.object({...})` at top level — `z` is an imported binding and
 * that call is pure, so the broad rule would ban the package. The narrow rule
 * catches the realistic registry-mutation shapes without that false positive.
 */
function mutatesImported(node: ts.CallExpression, imported: ReadonlySet<string>): boolean {
  const callee = unwrap(node.expression);
  if (!ts.isPropertyAccessExpression(callee)) return false;
  const method = callee.name.text;

  // Object.freeze(IMPORTED) and friends — the receiver is Object, so the thing
  // being mutated is the first argument.
  if (
    MUTATING_OBJECT_STATICS.has(method) &&
    ts.isIdentifier(unwrap(callee.expression)) &&
    (unwrap(callee.expression) as ts.Identifier).text === 'Object'
  ) {
    const target = node.arguments[0];
    return target !== undefined && rootIdentifier(target) !== null
      ? imported.has(rootIdentifier(target) as string)
      : false;
  }

  if (!MUTATING_METHODS.has(method)) return false;
  const root = rootIdentifier(callee.expression);
  return root !== null && imported.has(root);
}

/** Walk an expression tree, invoking `fn` for every call it contains. */
function forEachCall(node: ts.Node, fn: (call: ts.CallExpression) => void): void {
  if (ts.isCallExpression(node)) fn(node);
  ts.forEachChild(node, (child) => forEachCall(child, fn));
}

/**
 * Analyse one already-parsed source file. Exported so the unit test can drive
 * it with synthetic sources instead of fixture files on disk.
 */
export function findViolationsInSource(filePath: string, source: string): Violation[] {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.ESNext, true);
  const violations: Violation[] = [];

  const imported = collectImportedBindings(sourceFile);

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
      continue;
    }

    // Check 2b — a declaration is not automatically inert. A top-level
    // `const _ = REGISTRY.set('x', 1)` mutates an imported module on import
    // while presenting as a VariableStatement, and a class `static {}` block
    // runs on import while presenting as a ClassDeclaration. Both slip past a
    // check that only looks at statement kind.
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.initializer === undefined) continue;
        forEachCall(declaration.initializer, (call) => {
          if (mutatesImported(call, imported)) {
            violations.push({
              file: filePath,
              line: lineOf(sourceFile, call),
              rule: 'imported-mutation',
              detail: `${call.expression.getText(sourceFile)}(…) mutates an imported binding on import`,
            });
          }
        });
      }
    }

    if (ts.isClassDeclaration(statement)) {
      for (const member of statement.members) {
        if (ts.isClassStaticBlockDeclaration(member)) {
          violations.push({
            file: filePath,
            line: lineOf(sourceFile, member),
            rule: 'top-level-statement',
            detail: 'class `static {}` initializer block runs on import',
          });
        }
      }
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
  const root = resolveScanRoot(process.argv.slice(2));
  const label = relative(REPO_ROOT, root) || root;

  // Tri-state, per .claude/rules/verification.md: exit 2 means "I could not
  // check", which must never be reported as clean.
  //
  // Both refusals below are load-bearing. This guard's whole value is that it
  // fails when someone adds a side effect — so the ways it can silently stop
  // looking matter as much as the detection itself. A renamed package
  // directory, or an extension `isCheckedFile` does not recognise (`.mts`),
  // would otherwise walk an empty tree, find no violations, and print the
  // success line. "sideEffects": false would then be guarded by nothing.
  try {
    if (!statSync(root).isDirectory()) throw new Error('not a directory');
  } catch {
    console.error(`\n❌ Cannot check: ${label} is missing or is not a directory.`);
    process.exit(2);
  }

  const files = [...walk(root)];
  if (files.length === 0) {
    console.error(
      `\n❌ Cannot check: examined 0 files under ${label}. isCheckedFile() matches ` +
        '.ts/.tsx (excluding *.test.* and *.d.ts), so either the tree is empty or the ' +
        'package moved to an extension this guard does not know about. Either way the ' +
        'guard is broken, not the package pure.',
    );
    process.exit(2);
  }

  const violations = scanSharedPackage(root);

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

  // Print the denominator so a reader can see the scan had a population.
  console.log(
    `✅ @propertypro/shared is import-time pure ("sideEffects": false holds). ` +
      `Files scanned: ${files.length}.`,
  );
}

// Only run when invoked as a script. Without this, importing the module to unit
// test an exported check would execute main() and process.exit() out of the test
// runner.
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  main();
}
