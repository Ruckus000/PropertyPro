/**
 * The looks' names and descriptions, as a list that costs nothing to import.
 *
 * `LOOK_SUMMARIES` repeats four names and four descriptions that `LOOKS` holds,
 * so the Design panel (an editor chunk with next to no size budget left) can list
 * the looks without importing the registry and, behind it, the block schemas and
 * the switch planner. A copy of data needs a test that ties it to the original.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { LOOKS, LOOK_IDS, lookIdForLayout } from '@/lib/site-looks/looks';
import { LOOK_SUMMARIES } from '@/lib/site-looks/look-summaries';

/**
 * What a source file depends on, found with the TypeScript parser, not a regex:
 * a pattern over lines misses an import split across lines, a bare
 * `import './looks'` (no `from`), and a dynamic `import()` or `require()`.
 *
 * - `typeOnly`: `import type …` and `export type … from …`, which the compiler erases;
 * - `runtime`: every other import, export-from, `import()` and `require()` — and an
 *   inline `import { type A } from …`, which not every compiler setting erases.
 */
function moduleDependencies(fileName: string, source: string): { typeOnly: string[]; runtime: string[] } {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const typeOnly: string[] = [];
  const runtime: string[] = [];
  const specifier = (node: ts.Node | undefined): string =>
    node !== undefined && ts.isStringLiteralLike(node) ? node.text : '<computed>';

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      (node.importClause?.isTypeOnly ? typeOnly : runtime).push(specifier(node.moduleSpecifier));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      (node.isTypeOnly ? typeOnly : runtime).push(specifier(node.moduleSpecifier));
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      (node.isTypeOnly ? typeOnly : runtime).push(specifier(node.moduleReference.expression));
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      runtime.push(specifier(node.arguments[0]));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { typeOnly, runtime };
}

describe('LOOK_SUMMARIES', () => {
  it('lists the registry’s looks, in its order, with its names and descriptions', () => {
    expect(LOOK_SUMMARIES.length).toBeGreaterThan(0); // anti-vacuity: the comparison below saw looks
    expect(LOOK_SUMMARIES).toEqual(LOOKS.map(({ id, name, description }) => ({ id, name, description })));
  });

  it('names every look id', () => {
    expect(LOOK_SUMMARIES.map((summary) => summary.id)).toEqual([...LOOK_IDS]);
  });

  it('keeps a look’s id the same as its layout id, which the Design panel selects by (D2)', () => {
    for (const { id } of LOOK_SUMMARIES) expect(lookIdForLayout(id)).toBe(id);
    for (const look of LOOKS) expect(look.layoutId).toBe(look.id);
  });

  it('imports nothing at run time, so listing the looks pulls in no other module', () => {
    const fileName = path.resolve(__dirname, '../../../src/lib/site-looks/look-summaries.ts');
    const source = readFileSync(fileName, 'utf8');

    // The file parses, and the scan really read it: its one import, of the registry's types, was seen.
    const { diagnostics } = ts.transpileModule(source, { fileName, reportDiagnostics: true });
    expect(diagnostics ?? []).toEqual([]);
    const { typeOnly, runtime } = moduleDependencies(fileName, source);
    expect(typeOnly).toEqual(['./looks']);

    // Anything else would be a module the panel's chunk carries: the registry above all.
    expect(runtime).toEqual([]);
  });
});

describe('the run-time import check', () => {
  // The check above is only worth having if it can see what it is looking for.
  it.each([
    ['a named import', "import { LOOKS } from './looks';", './looks'],
    ['a named import split across lines', "import {\n  LOOKS,\n  getLook,\n} from './looks';", './looks'],
    ['a bare side-effect import', "import './looks';", './looks'],
    ['a default import', "import looks from './looks';", './looks'],
    ['a namespace import', "import * as looks from './looks';", './looks'],
    ['an import through the alias', "import { LOOKS } from '@/lib/site-looks/looks';", '@/lib/site-looks/looks'],
    ['an import of anything else', "import { z } from 'zod';", 'zod'],
    ['a re-export', "export { LOOKS } from './looks';", './looks'],
    ['a star re-export', "export * from './looks';", './looks'],
    ['a dynamic import', "export const load = () => import('./looks');", './looks'],
    ['a require', "const looks = require('./looks');", './looks'],
    ['an import = require', "import looks = require('./looks');", './looks'],
    ['an inline type specifier, which not every compiler setting erases', "import { type LookId } from './looks';", './looks'],
  ])('finds %s', (_label, source, expected) => {
    expect(moduleDependencies('probe.ts', source).runtime).toEqual([expected]);
  });

  it.each([
    ['a type import', "import type { LookId } from './looks';"],
    ['a type import split across lines', "import type {\n  LookId,\n  LookDefinition,\n} from './looks';"],
    ['a type re-export', "export type { LookId } from './looks';"],
    ['code that imports nothing', "export const LOOK_SUMMARIES = [] as const;"],
  ])('lets %s through', (_label, source) => {
    expect(moduleDependencies('probe.ts', source).runtime).toEqual([]);
  });

  it('files a type import as type-only', () => {
    expect(moduleDependencies('probe.ts', "import type { LookId } from './looks';").typeOnly).toEqual(['./looks']);
  });
});
