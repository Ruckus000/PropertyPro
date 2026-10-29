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
import { describe, expect, it } from 'vitest';
import { LOOKS, LOOK_IDS, lookIdForLayout } from '@/lib/site-looks/looks';
import { LOOK_SUMMARIES } from '@/lib/site-looks/look-summaries';

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
    const source = readFileSync(path.resolve(__dirname, '../../../src/lib/site-looks/look-summaries.ts'), 'utf8');

    const imports = source.match(/^\s*(import|export)\b[^\n]*\bfrom\b[^\n]*$/gm) ?? [];
    // Type imports are erased by the compiler. Anything else would be a module the panel's chunk carries.
    expect(imports.filter((line) => !/^\s*import\s+type\b/.test(line))).toEqual([]);
    expect(source).not.toMatch(/\brequire\(|\bimport\(/);
  });
});
