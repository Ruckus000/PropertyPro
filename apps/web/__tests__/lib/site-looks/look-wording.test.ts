/**
 * The looks' welcome words, as a table that costs nothing to import.
 *
 * `heroWordingForLayout` repeats four headlines and four subtitles that `LOOKS`
 * holds, so the hero form can offer "Use the look's wording" without importing
 * the registry and, behind it, the block schemas and the switch planner. A copy
 * of data needs a test that ties it to the original.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { LOOKS, LOOK_IDS, lookIdForLayout } from '@/lib/site-looks/looks';
import { heroWordingForLayout } from '@/lib/site-looks/look-wording';

describe('heroWordingForLayout', () => {
  it("gives each look's own welcome words, as the registry has them", () => {
    expect(LOOKS.length).toBeGreaterThan(0); // anti-vacuity: the comparison below saw looks
    for (const look of LOOKS) {
      const hero = look.sections.find((section) => section.blockType === 'hero');
      expect(hero, `${look.id} has a hero`).toBeDefined();
      const content = hero!.content as { headline: string; subtitle: string };
      expect(heroWordingForLayout(look.layoutId), look.id).toEqual({
        lookName: look.name,
        headline: content.headline,
        subtitle: content.subtitle,
      });
    }
  });

  it('has wording for exactly the layouts that are looks', () => {
    for (const id of LOOK_IDS) expect(heroWordingForLayout(id)).not.toBeNull();
    for (const layoutId of ['tidewater', 'boulevard', 'sable', '', 'Bayfront', 'toString', null, undefined]) {
      expect(lookIdForLayout(layoutId)).toBeNull();
      expect(heroWordingForLayout(layoutId), String(layoutId)).toBeNull();
    }
  });

  it('imports nothing at run time, so the hero form pulls in no other module', () => {
    const fileName = path.resolve(__dirname, '../../../src/lib/site-looks/look-wording.ts');
    const source = readFileSync(fileName, 'utf8');
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    const runtime: string[] = [];
    const typeOnly: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
        (node.importClause?.isTypeOnly ? typeOnly : runtime).push(node.moduleSpecifier.text);
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        runtime.push('<export-from>');
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      ) {
        runtime.push('<dynamic>');
      }
      ts.forEachChild(node, visit);
    };
    visit(file);

    // The scan read the file: its one import, of the registry's types, was seen.
    expect(typeOnly).toEqual(['./looks']);
    expect(runtime).toEqual([]);
  });
});
