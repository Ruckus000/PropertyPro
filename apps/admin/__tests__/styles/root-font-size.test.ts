/**
 * apps/admin must not override the root font size.
 *
 * `:root { font-size: 18px }` made every `rem` in Tailwind scale by 18/16 and
 * overrode the user's own browser font-size setting. Decision D1 of the Geist
 * density plan (2026-11-03) removed it from apps/web; Task 9 (D6) does the same
 * here so the two apps render the same rem figures. Reading comfort is served
 * by the "large text" mode in `packages/ui/src/tokens/text-size.ts`, which both
 * root layouts enable by default.
 *
 * Source-reading test: a root font-size is a global rule with no component to
 * render.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const GLOBALS_CSS = path.resolve(__dirname, '../../src/styles/globals.css');

describe('apps/admin root font size (D1, D6)', () => {
  const css = fs.readFileSync(GLOBALS_CSS, 'utf8');

  it('reads a non-empty stylesheet', () => {
    // Anti-vacuity: an empty or moved file would pass the absence check below.
    expect(css).toContain('@tailwind utilities');
  });

  it('does not set font-size on :root', () => {
    expect(css).not.toMatch(/:root\s*\{[^}]*font-size/);
  });
});
