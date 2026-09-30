/**
 * The site-frame contract (v4 device preview).
 *
 * Public-site components respond to their `.site-frame` container, not the
 * window (`site-md:` etc, defined in `tailwind.config.ts`). That buys a true
 * phone layout inside the editor canvas, and carries one sharp edge: a render
 * root WITHOUT `site-frame` gives the variants nothing to query, so they never
 * match and the page silently shows its phone layout on every screen. No type
 * check, no guard and no other test would notice.
 *
 * Three halves, each of which fails on its own:
 *  1. the variants compile to container queries against the named container;
 *  2. no public-site file uses a bare viewport variant (`md:`), which would
 *     ignore the frame and lie in the phone preview;
 *  3. every file that RENDERS public-site components wraps them in
 *     `site-frame` — and every importer is classified, so a new render root
 *     fails here until someone decides which it is.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { describe, expect, it } from 'vitest';
import config from '../../tailwind.config';

const WEB_SRC = join(__dirname, '..', '..', 'src');
const PUBLIC_SITE = join(WEB_SRC, 'components', 'public-site');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/**
 * Files that carry `site-frame`. The public-site layout imports nothing from
 * `components/public-site/` — it frames the pages below it — so it is checked
 * for the class but is not expected among the importers.
 */
const FRAME_PROVIDERS = ['app/public-site/layout.tsx'];

/** Importers that render public-site components and so must carry `site-frame`. */
const RENDER_ROOTS = [
  'app/(site-preview)/pm/site-preview/page.tsx',
  'app/dev/site-preview/page.tsx',
  'components/pm/site-editor-v3/PreviewDialog.tsx',
  'components/pm/site-editor-v3/canvas/Canvas.tsx',
];

/**
 * Importers that do NOT need a frame, each with the reason. Anything importing
 * from `components/public-site/` must appear in exactly one of these lists.
 */
const NOT_ROOTS: Record<string, string> = {
  // Rendered inside `app/public-site/layout.tsx`, which carries the frame.
  'app/public-site/[[...slug]]/page.tsx': 'inside the public-site layout frame',
  'app/public-site/not-found.tsx': 'inside the public-site layout frame',
  // Renders only UrgentNoticeBanner, which has no responsive variants.
  'app/public-transparency/page.tsx': 'UrgentNoticeBanner has no site- variants',
  // Renders blocks inside Canvas, which carries the frame.
  'components/pm/site-editor-v3/canvas/CanvasBlock.tsx': 'inside the Canvas frame',
  // Types and data helpers only — they render nothing.
  'lib/public-site/layout-resolver.ts': 'types only',
  'lib/public-site/preview-overrides.ts': 'types only',
  'lib/site-editor/load-canvas-context.ts': 'types only',
  'lib/site-editor/preview-data.ts': 'types only',
};

describe('site-frame variants', () => {
  it('compile to container queries against the named site container', async () => {
    const result = await postcss([
      tailwind({
        ...config,
        content: [{ raw: 'site-frame site-md:grid-cols-2', extension: 'html' }],
        corePlugins: { preflight: false },
      }),
    ]).process('@tailwind utilities;', { from: undefined });
    const css = result.css.replace(/\s+/g, ' ');

    expect(css).toContain('container-type: inline-size');
    expect(css).toContain('container-name: site');
    expect(css).toMatch(/@container site \(min-width: 768px\) \{ \.site-md\\:grid-cols-2/);
  });
});

describe('public-site components respond to the frame, not the window', () => {
  it('uses no bare viewport variant anywhere in components/public-site', () => {
    const files = walk(PUBLIC_SITE);
    expect(files.length).toBeGreaterThan(10); // anti-vacuity: the scan saw the tree
    const offenders = files.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/(?<![\w-])(sm|md|lg|xl|2xl):[a-z[!-]/g)].map(
        (m) => `${relative(WEB_SRC, file)}: ${m[0]}`,
      ),
    );
    expect(offenders).toEqual([]);
  });
});

describe('every public-site render root carries the frame', () => {
  const importers = walk(WEB_SRC)
    .filter((file) => !file.startsWith(PUBLIC_SITE))
    .filter((file) => readFileSync(file, 'utf8').includes("from '@/components/public-site/"))
    .map((file) => relative(WEB_SRC, file))
    .sort();

  it('classifies every importer as a render root or a documented non-root', () => {
    expect(importers.length).toBeGreaterThan(0); // anti-vacuity
    const classified = [...RENDER_ROOTS, ...Object.keys(NOT_ROOTS)].sort();
    expect(importers).toEqual(classified);
  });

  it.each([...FRAME_PROVIDERS, ...RENDER_ROOTS])('%s renders inside site-frame', (root) => {
    expect(readFileSync(join(WEB_SRC, root), 'utf8')).toMatch(/className="[^"]*\bsite-frame\b|'site-frame\b/);
  });
});
