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
 *
 * Frames are not the only place a community's fonts are applied: the demo
 * landing page paints `font-body` with no `.site-frame` at all, and lost Inter
 * the same way. So the last block SCANS apps/web/src for every file that
 * applies `font-body` / `font-heading` / `--theme-font-*` and makes each one
 * either carry the class or be named, with a reason, as living inside a root
 * that does. A new branded surface fails there until someone classifies it.
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

/** Branded roots that are not a `.site-frame` but still need Inter underneath. */
const OTHER_BRANDED_ROOTS = ['app/demo/[slug]/page.tsx'];

/**
 * Files that apply a theme font and carry no class of their own, each with the
 * root that supplies it. Every other file naming a theme font must appear in
 * the roots above.
 */
const INSIDE_A_ROOT: Record<string, string> = {
  'app/public-site/not-found.tsx': 'inside the public-site layout, a SITE_FONT_CLASS root',
  'app/public-site/[[...slug]]/page.tsx': 'inside the public-site layout, a SITE_FONT_CLASS root',
  'lib/site-editor/canvas-theme.ts': 'builds the vars the Canvas root (SITE_FONT_CLASS) applies',
  'lib/public-site/site-font.ts': 'this loader; names the classes in its docblock',
};
/** Everything under here renders inside a `.site-frame`, which site-frame.test.ts proves. */
const INSIDE_A_ROOT_PREFIXES = ['components/public-site/'];

function walk(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx|css)$/.test(name) ? [p] : [];
  });
}

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

  it('exposes a class that sets font-family (className), not only the variable', () => {
    // `.variable` only defines a custom property. Text outside `font-body` /
    // `font-heading`, or a theme font that fails to load, inherits from the
    // frame; only a real `font-family` on the frame keeps that on Inter, not Geist.
    const decl = siteFont.match(/export const SITE_FONT_CLASS\s*=\s*([^;]+);/)?.[1] ?? '';
    expect(decl).toContain('inter.className');
    expect(decl).toContain('inter.variable');
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

  it.each(SITE_FRAME_ROOTS)('%s never puts it on an element that also has font-body', (file) => {
    // Two font-family classes of equal specificity resolve by stylesheet order,
    // which could let Inter beat a valid theme font. Put it on a wrapper.
    for (const line of read(file).split('\n')) {
      if (line.includes('SITE_FONT_CLASS') && !line.includes('import ')) {
        expect(line).not.toContain('font-body');
      }
    }
  });
});

describe('the demo landing page keeps Inter for its branded text', () => {
  it.each(OTHER_BRANDED_ROOTS)('%s', (file) => {
    const text = read(file);
    expect(text).toContain("import { SITE_FONT_CLASS } from '@/lib/public-site/site-font'");
    expect(text.replace(/import \{ SITE_FONT_CLASS \}[^\n]*\n/, '')).toContain('SITE_FONT_CLASS');
    for (const line of text.split('\n')) {
      if (line.includes('SITE_FONT_CLASS') && !line.includes('import ')) {
        expect(line).not.toContain('font-body');
      }
    }
  });
});

describe('every file applying a theme font is under a SITE_FONT_CLASS root', () => {
  const THEME_FONT = /font-body|font-heading|--theme-font-/;
  const files = walk(SRC)
    .map((f) => path.relative(SRC, f).split(path.sep).join('/'))
    .filter((rel) => THEME_FONT.test(read(rel)));
  const roots = new Set([...SITE_FRAME_ROOTS, ...OTHER_BRANDED_ROOTS]);

  it('scans a non-empty population', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('classifies every one', () => {
    const unclassified = files.filter(
      (rel) =>
        !roots.has(rel) &&
        !(rel in INSIDE_A_ROOT) &&
        !INSIDE_A_ROOT_PREFIXES.some((p) => rel.startsWith(p)),
    );
    expect(
      unclassified,
      'these apply a theme font outside a known SITE_FONT_CLASS root: add the class, ' +
        'or name the root that supplies it in INSIDE_A_ROOT',
    ).toEqual([]);
  });

  it('has no stale allowlist entries', () => {
    for (const rel of Object.keys(INSIDE_A_ROOT)) {
      expect(files, `${rel} no longer names a theme font`).toContain(rel);
    }
  });
});
