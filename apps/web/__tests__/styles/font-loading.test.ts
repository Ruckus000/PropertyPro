/**
 * Geist + Geist Mono are the app's sans and mono faces (decision D3 of the Geist
 * density plan, 2026-11-03), vendored and loaded with `next/font/local`.
 *
 * Source-reading test: a font loader call has no component to render, and
 * `next/font/local` resolves its files at build time, so the useful assertions
 * are on the call sites and on the committed bytes.
 *
 * What it pins:
 *  - the root layout loads Geist as `--font-sans` and Geist Mono as `--font-mono`,
 *    and no longer loads Inter (marketing does, under its own variable);
 *  - the marketing layout and `--mk-sans` use `--font-marketing-sans`, so
 *    swapping the root font cannot silently restyle the landing page (#1428);
 *  - the four authenticated components moved off the Fraunces `font-display`;
 *  - each vendored woff2 exists and matches the sha256 in fonts/README.md.
 */
import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../../src');
const FONTS_DIR = path.join(SRC, 'app/fonts');

const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

const rootLayout = read('app/layout.tsx');
const marketingLayout = read('app/(marketing)/layout.tsx');
const marketingCss = read('app/(marketing)/marketing-theme.css');
const readme = fs.readFileSync(path.join(FONTS_DIR, 'README.md'), 'utf8');

/** Text of the first `localFont({...})` call whose body mentions `needle`. */
function localFontCallFor(source: string, needle: string): string {
  const calls = source.split('localFont(').slice(1);
  const call = calls.find((c) => c.slice(0, c.indexOf('});')).includes(needle));
  return call ? call.slice(0, call.indexOf('});')) : '';
}

describe('root layout font loading', () => {
  it('loads Geist as --font-sans', () => {
    const call = localFontCallFor(rootLayout, './fonts/geist-latin-var.woff2');
    expect(call).not.toBe('');
    expect(call).toMatch(/variable:\s*["']--font-sans["']/);
  });

  it('loads Geist Mono as --font-mono', () => {
    const call = localFontCallFor(rootLayout, './fonts/geist-mono-latin-var.woff2');
    expect(call).not.toBe('');
    expect(call).toMatch(/variable:\s*["']--font-mono["']/);
  });

  it('no longer loads Inter', () => {
    expect(rootLayout).not.toContain('inter-latin-var.woff2');
  });

  it('still loads Fraunces for the surfaces that keep it', () => {
    const call = localFontCallFor(rootLayout, './fonts/fraunces-latin-var.woff2');
    expect(call).toMatch(/variable:\s*["']--font-display["']/);
  });
});

describe('marketing keeps Inter', () => {
  it('declares --font-marketing-sans from the Inter file', () => {
    const call = localFontCallFor(marketingLayout, 'inter-latin-var.woff2');
    expect(call).toContain('../fonts/inter-latin-var.woff2');
    expect(call).toMatch(/variable:\s*["']--font-marketing-sans["']/);
  });

  it('applies that variable on the marketing-theme root', () => {
    expect(marketingLayout).toMatch(/\$\{inter\.variable\}[^`]*marketing-theme/);
  });

  it('points --mk-sans at --font-marketing-sans, not the app font', () => {
    expect(marketingCss).toContain('--mk-sans:var(--font-marketing-sans)');
    expect(marketingCss).not.toMatch(/--mk-sans:[^;]*var\(--font-sans\)/);
  });
});

describe('authenticated components no longer use the Fraunces display class (D3)', () => {
  const FILES = [
    'components/dashboard/overview/status-hero.tsx',
    'components/audit/AuditTrailViewer.tsx',
    'components/pm/site-editor-v3/settings/SettingsView.tsx',
    'components/pm/site-editor-v3/EditorTopBar.tsx',
  ];

  it.each(FILES)('%s has no font-display', (file) => {
    const text = read(file);
    // Anti-vacuity: a moved file would read as empty and pass the absence check.
    expect(text.length).toBeGreaterThan(100);
    expect(text).not.toContain('font-display');
  });
});

describe('vendored font files match the README table', () => {
  // Rows look like: | `geist-latin-var.woff2` | Geist | `wght 100..900` | `<sha256>` | 12,345 |
  const rows = [...readme.matchAll(/^\|\s*`([^`]+\.woff2)`\s*\|[^|]*\|[^|]*\|\s*`([0-9a-f]{64})`\s*\|\s*([\d,]+)\s*\|/gm)].map(
    (m) => ({ file: m[1]!, sha256: m[2]!, bytes: Number(m[3]!.replace(/,/g, '')) }),
  );

  it('lists every vendored woff2, including both Geist files', () => {
    const listed = rows.map((r) => r.file).sort();
    const onDisk = fs.readdirSync(FONTS_DIR).filter((f) => f.endsWith('.woff2')).sort();
    expect(listed).toEqual(onDisk);
    expect(listed).toContain('geist-latin-var.woff2');
    expect(listed).toContain('geist-mono-latin-var.woff2');
  });

  it.each(['geist-latin-var.woff2', 'geist-mono-latin-var.woff2', 'inter-latin-var.woff2'])(
    '%s exists with the recorded sha256 and size',
    (file) => {
      const row = rows.find((r) => r.file === file);
      expect(row, `${file} has no README table row`).toBeDefined();
      const bytes = fs.readFileSync(path.join(FONTS_DIR, file));
      expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(row!.sha256);
      expect(bytes.length).toBe(row!.bytes);
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
    },
  );

  it('ships the Geist licence', () => {
    const licence = fs.readFileSync(path.join(FONTS_DIR, 'OFL-Geist.txt'), 'utf8');
    expect(licence).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });
});
