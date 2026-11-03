/**
 * apps/web must not override the root font size.
 *
 * #346 set `:root { font-size: 18px }` so the app read larger. Every `rem` in
 * Tailwind (`text-sm`, `h-9`, `max-w-*`, `p-4`) then scaled by 18/16, so the
 * interface rendered 12.5% bigger than any figure written down for it, and a
 * user's own browser font-size setting was overridden by a pixel value.
 *
 * Decision D1 of the Geist density plan (2026-11-03): the root is left at the
 * browser default (16px, or whatever the user chose). Reading comfort is
 * served by the "large text" mode in `packages/ui/src/tokens/text-size.ts`,
 * which is on by default and scales text, not the whole rem space.
 *
 * Source-reading test: it asserts on the stylesheet itself, because a root
 * font-size is a global rule with no component to render.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const GLOBALS_CSS = path.resolve(__dirname, '../../src/app/globals.css');

describe('apps/web root font size (D1, #346)', () => {
  const css = fs.readFileSync(GLOBALS_CSS, 'utf8');

  it('reads a non-empty stylesheet', () => {
    // Anti-vacuity: an empty or moved file would pass the absence check below.
    expect(css).toContain('@tailwind utilities');
  });

  it('does not set font-size on :root', () => {
    expect(css).not.toMatch(/:root\s*\{[^}]*font-size/);
  });
});
