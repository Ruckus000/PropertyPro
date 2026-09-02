/**
 * The Switch's ON/OFF states must stay VISIBLE.
 *
 * `guard:class-resolution` proves every class in switch.tsx emits CSS, but a
 * class can emit perfectly good CSS and still render an invisible control. That
 * is not hypothetical: the component shipped with `data-[state=unchecked]:bg-input`
 * and a `bg-background` thumb — classes this repo never defined — so the track
 * had no colour at all. The obvious repair, pointing them at the `sand` surface
 * ramp, would have satisfied a "does it emit CSS" check while leaving the OFF
 * state at 1.13:1 against the thumb: still invisible, now undetectably so.
 *
 * So this test asserts the property a user actually experiences — contrast —
 * and reads the class names out of switch.tsx rather than hardcoding them, so
 * swapping the track to a lower-contrast token turns it red.
 *
 * WCAG 2.1 SC 1.4.11 Non-text Contrast: 3:1 for the parts of a control that
 * convey its state/boundary.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import twConfig from '../../tailwind.config';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const SWITCH_SRC = path.join(REPO_ROOT, 'apps/web/src/components/ui/switch.tsx');
const TOKENS_CSS = path.join(REPO_ROOT, 'packages/ui/src/styles/tokens.css');

const MIN_NON_TEXT_CONTRAST = 3;

/** `--foo: #ABC;` pairs from tokens.css. */
function readCssVars(): Map<string, string> {
  const css = fs.readFileSync(TOKENS_CSS, 'utf8');
  const vars = new Map<string, string>();
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    if (!vars.has(m[1])) vars.set(m[1], m[2].trim());
  }
  return vars;
}

/** Resolve `var(--a, var(--b))` chains down to a literal colour. */
function resolveVar(value: string, vars: Map<string, string>, depth = 0): string {
  if (depth > 10) throw new Error(`Unresolvable var chain: ${value}`);
  const m = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([\s\S]+))?\)$/i.exec(value.trim());
  if (!m) return value.trim();
  const [, name, fallback] = m;
  const direct = vars.get(name);
  // A theme-overridable var (e.g. --theme-primary) is not defined in tokens.css;
  // its documented default is the fallback arm.
  if (direct !== undefined) return resolveVar(direct, vars, depth + 1);
  if (fallback !== undefined) return resolveVar(fallback, vars, depth + 1);
  throw new Error(`CSS var ${name} is not defined and has no fallback`);
}

/** Look a Tailwind colour class suffix up in the config, e.g. `surface-card`. */
function classToCssValue(suffix: string): string {
  const colors = (twConfig.theme?.extend?.colors ?? {}) as Record<string, unknown>;
  const parts = suffix.split('-');
  // Longest family match first so `content-tertiary` beats a bare `content`.
  for (let i = parts.length; i > 0; i--) {
    const family = parts.slice(0, i).join('-');
    const rest = parts.slice(i).join('-') || 'DEFAULT';
    const entry = colors[family];
    if (typeof entry === 'string' && rest === 'DEFAULT') return entry;
    if (entry && typeof entry === 'object') {
      const val = (entry as Record<string, string>)[rest];
      if (typeof val === 'string') return val;
    }
  }
  throw new Error(`No Tailwind colour maps to "${suffix}"`);
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a 6-digit hex colour: "${hex}"`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance(hex: string): number {
  const srgb = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Resolve a `bg-<suffix>` class straight through to a hex colour. */
function colourOf(classSuffix: string, vars: Map<string, string>): string {
  return resolveVar(classToCssValue(classSuffix), vars);
}

describe('Switch — state visibility (WCAG 1.4.11)', () => {
  const src = fs.readFileSync(SWITCH_SRC, 'utf8');
  const vars = readCssVars();

  const thumbClass = /block[^"]*?\bbg-([a-z0-9-]+)/.exec(src)?.[1];
  const uncheckedClass = /data-\[state=unchecked\]:bg-([a-z0-9-]+)/.exec(src)?.[1];
  const checkedClass = /data-\[state=checked\]:bg-([a-z0-9-]+)/.exec(src)?.[1];

  // Anti-vacuity: if the extraction stops matching, fail loudly rather than
  // silently testing `undefined` against `undefined`.
  it('exposes a thumb colour and both track state colours', () => {
    expect(thumbClass, 'thumb bg-* class not found in switch.tsx').toBeTruthy();
    expect(uncheckedClass, 'unchecked track bg-* class not found').toBeTruthy();
    expect(checkedClass, 'checked track bg-* class not found').toBeTruthy();
    expect(uncheckedClass).not.toBe(checkedClass);
  });

  it('keeps the thumb visible against the OFF track', () => {
    const ratio = contrastRatio(colourOf(thumbClass!, vars), colourOf(uncheckedClass!, vars));
    expect(
      ratio,
      `thumb (bg-${thumbClass}) on OFF track (bg-${uncheckedClass}) is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(MIN_NON_TEXT_CONTRAST);
  });

  it('keeps the thumb visible against the ON track', () => {
    const ratio = contrastRatio(colourOf(thumbClass!, vars), colourOf(checkedClass!, vars));
    expect(
      ratio,
      `thumb (bg-${thumbClass}) on ON track (bg-${checkedClass}) is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(MIN_NON_TEXT_CONTRAST);
  });

  it('keeps the control distinguishable from the page behind it', () => {
    const page = colourOf('surface-page', vars);
    for (const [label, cls] of [['OFF', uncheckedClass!], ['ON', checkedClass!]] as const) {
      const ratio = contrastRatio(colourOf(cls, vars), page);
      expect(
        ratio,
        `${label} track (bg-${cls}) on the page is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(MIN_NON_TEXT_CONTRAST);
    }
  });
});
