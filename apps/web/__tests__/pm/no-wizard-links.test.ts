/**
 * The website onboarding wizard is gone (website builder, Tasks 24-25). Its
 * path survives only as a redirect to the website home, for bookmarks and old
 * help links, so no code in the app may link to it: every such link would cost
 * a manager an extra hop and say "wizard" in the address bar.
 *
 * A source scan, not a render: the links are spread over server pages, columns,
 * banners and route tables, and a link built from a template string only shows
 * up as text.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../../src');
const RETIRED = 'pm/onboarding/website';
/** The redirect itself, which has to name the path it answers for. */
const REDIRECT_PAGE = path.join(SRC, 'app/(authenticated)/pm/onboarding/website/page.tsx');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe('retired website wizard', () => {
  it('no link points at /pm/onboarding/website', () => {
    expect(fs.existsSync(SRC)).toBe(true);
    const files = sourceFiles(SRC);
    // Vacuous if the scan found nothing to read.
    expect(files.length).toBeGreaterThan(500);
    expect(fs.existsSync(REDIRECT_PAGE)).toBe(true);

    const offenders = files.filter(
      (file) => file !== REDIRECT_PAGE && fs.readFileSync(file, 'utf8').includes(RETIRED),
    );
    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([]);
  });
});
