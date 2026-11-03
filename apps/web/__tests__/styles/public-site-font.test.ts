/**
 * The public association site keeps its pre-Geist body font.
 *
 * Community themes name fonts as CSS family names and default to `Inter`, which
 * `toFontLinks` never fetches because it used to be self-hosted by the root
 * layout. The site paints `font-family: var(--theme-font-body, Inter),
 * var(--font-sans), sans-serif`. When the root layout moved to Geist, no
 * `Inter` face was on the page any more, the family matched nothing, and the
 * fallback `--font-sans` (Geist) painted every default-themed site's text. The
 * site is community-branded and outside the redesign, so it loads Inter itself.
 *
 * Source-reading, in the style of font-loading.test.ts: a loader call has no
 * component to render. The failure it prevents has no type error and no test
 * that would notice, because the page still renders a font.
 *
 * Every `.site-frame` render root must carry the loader's class: a root without
 * it pulls no @font-face into that page and silently falls back to Geist. The
 * root list mirrors `public-site/site-frame.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { THEME_DEFAULTS } from '@propertypro/theme';

const SRC = path.resolve(__dirname, '../../src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

const siteFont = read('lib/public-site/site-font.ts');

const SITE_FRAME_ROOTS = [
  'app/public-site/layout.tsx',
  'app/(site-preview)/pm/site-preview/page.tsx',
  'app/dev/site-preview/page.tsx',
  'components/pm/site-editor-v3/PreviewDialog.tsx',
  'components/pm/site-editor-v3/canvas/Canvas.tsx',
];

describe('public-site Inter loader', () => {
  it('loads the vendored Inter file, not the app font', () => {
    expect(siteFont).toMatch(/src:\s*['"]\.\.\/\.\.\/app\/fonts\/inter-latin-var\.woff2['"]/);
    expect(siteFont).not.toContain('geist');
    // The resolved path must exist, or next/font fails the build.
    const resolved = path.resolve(SRC, 'lib/public-site', '../../app/fonts/inter-latin-var.woff2');
    expect(fs.existsSync(resolved)).toBe(true);
  });

  it('uses descriptors identical to the marketing loader (same family name merges)', () => {
    const marketing = read('app/(marketing)/layout.tsx');
    for (const d of [/weight:\s*['"]100 900['"]/, /style:\s*['"]normal['"]/, /display:\s*['"]swap['"]/]) {
      expect(siteFont).toMatch(d);
      expect(marketing).toMatch(d);
    }
  });

  it('is assigned to a const named `inter`, because that is the emitted family name', () => {
    // next/font/local names the @font-face after the const, case-insensitively
    // matched by the theme's `Inter`. `const siteInter = ...` shipped once and
    // loaded a family nothing referenced.
    expect(siteFont).toMatch(/\bconst inter\s*=\s*localFont\(/);
  });

  it('exposes the class the roots apply', () => {
    expect(siteFont).toMatch(/export const SITE_FONT_CLASS\s*=\s*inter\.variable/);
  });

  it('is needed: the theme default body font is the family Inter', () => {
    // If this ever changes, the premise of the loader needs rechecking.
    expect(THEME_DEFAULTS.fontBody).toBe('Inter');
  });
});

describe('every site-frame render root loads it', () => {
  it.each(SITE_FRAME_ROOTS)('%s', (file) => {
    const text = read(file);
    expect(text).toContain("import { SITE_FONT_CLASS } from '@/lib/public-site/site-font'");
    // Used on the element, not just imported.
    expect(text.replace(/import \{ SITE_FONT_CLASS \}[^\n]*\n/, '')).toContain('SITE_FONT_CLASS');
    expect(text).toContain('site-frame');
  });
});
