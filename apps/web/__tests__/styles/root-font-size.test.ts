/**
 * apps/web root font size: fluid, inside the signed-in app only.
 *
 * #346 pinned `:root { font-size: 18px }`, which overrode a user's own browser
 * setting and was the same size on every screen. #1444 (D1) deleted it, which
 * left a 1440px laptop with the smallest interface of all. Since 2026-11-03 the
 * app shell's root grows with the viewport instead: browser default (100%) up
 * to 1024px, 125% from 1856px. Type and Tailwind spacing are rem, so text,
 * controls and padding scale together.
 *
 * Source-reading test: a root font-size is a global rule with no component to
 * render, and JSDOM evaluates neither `:has()` nor `clamp()`.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
const css = read('../../src/app/globals.css');
const shell = read('../../src/components/layout/app-shell.tsx');

/** Every `font-size` declared on a selector that targets the root. */
function rootFontSizeRules(source: string): { selector: string; value: string }[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...code.matchAll(/([^{};]*:root[^{};]*)\{([^}]*)\}/g)].flatMap(([, selector, body]) => {
    const m = /font-size:\s*([^;]+);/.exec(body!);
    return m ? [{ selector: selector!.trim(), value: m[1]!.trim() }] : [];
  });
}

describe('apps/web root font size', () => {
  it('reads a non-empty stylesheet', () => {
    // Anti-vacuity: an empty or moved file would pass every check below.
    expect(css).toContain('@tailwind utilities');
  });

  it('sets exactly one root font size, scoped to the app shell', () => {
    // A bare `:root` would also resize marketing and the public site.
    expect(rootFontSizeRules(css).map((r) => r.selector)).toEqual([':root:has([data-app-shell])']);
  });

  it('is a percentage clamp from the browser default to 125%', () => {
    const [rule] = rootFontSizeRules(css);
    // Percentages, never px: a user's own browser font size must still count.
    expect(rule!.value).toMatch(/^clamp\(100%,\s*[\d.]+%\s*\+\s*[\d.]+vw,\s*125%\)$/);
  });

  it('reaches 16px at 1024, 18px at 1440 and 20px at 1856 (16px browser default)', () => {
    const [rule] = rootFontSizeRules(css);
    const [, a, b] = /\+?\s*([\d.]+)%\s*\+\s*([\d.]+)vw/.exec(rule!.value.replace(/^clamp\(100%,/, ''))!;
    // The preferred value in px at a given viewport width.
    const at = (width: number) => (16 * Number(a)) / 100 + (Number(b) * width) / 100;
    expect(at(1024)).toBeCloseTo(16, 1);
    expect(at(1440)).toBeCloseTo(18, 1);
    expect(at(1856)).toBeCloseTo(20, 1);
  });

  it('the shell renders the attribute the rule keys on', () => {
    expect(shell).toMatch(/<div data-app-shell\b/);
  });
});
