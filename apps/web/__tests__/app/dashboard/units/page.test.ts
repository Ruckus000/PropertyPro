import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('/dashboard/units page', () => {
  const pagePath = path.resolve(
    __dirname,
    '../../../../src/app/(authenticated)/dashboard/units/page.tsx',
  );

  it('exists on disk', () => {
    expect(fs.existsSync(pagePath)).toBe(true);
  });

  it('delegates rendering to UnitsPageClient (mirrors residents pattern)', () => {
    const src = fs.readFileSync(pagePath, 'utf8');
    expect(src).toMatch(/<UnitsPageClient/);
  });
});
