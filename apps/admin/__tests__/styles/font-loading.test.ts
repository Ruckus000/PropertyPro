/**
 * apps/admin loads Geist + Geist Mono as its sans and mono faces (Task 9 of the
 * Geist density plan, 2026-11-03), vendored and loaded with `next/font/local`,
 * mirroring `apps/web/__tests__/styles/font-loading.test.ts`.
 *
 * Source-reading test: a font loader call has no component to render, and
 * `next/font/local` resolves its files at build time, so the useful assertions
 * are on the call sites and on the committed bytes.
 *
 * What it pins:
 *  - the root layout loads Geist as `--font-sans` and Geist Mono as `--font-mono`,
 *    and no longer loads Inter;
 *  - Fraunces stays as `--font-display` (AdminPageHeader's visible `<h1>`);
 *  - each vendored woff2 exists and matches the sha256 in fonts/README.md, and
 *    the two Geist files are byte-identical to apps/web's copies.
 */
import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../../src');
const FONTS_DIR = path.join(SRC, 'app/fonts');
const WEB_FONTS_DIR = path.resolve(__dirname, '../../../web/src/app/fonts');

const rootLayout = fs.readFileSync(path.join(SRC, 'app/layout.tsx'), 'utf8');
const readme = fs.readFileSync(path.join(FONTS_DIR, 'README.md'), 'utf8');

const sha256 = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');

/** Text of the first `localFont({...})` call whose body mentions `needle`. */
function localFontCallFor(source: string, needle: string): string {
  const calls = source.split('localFont(').slice(1);
  const call = calls.find((c) => c.slice(0, c.indexOf('});')).includes(needle));
  return call ? call.slice(0, call.indexOf('});')) : '';
}

describe('admin root layout font loading', () => {
  it('loads Geist as --font-sans', () => {
    const call = localFontCallFor(rootLayout, './fonts/geist-latin-var.woff2');
    expect(call).not.toBe('');
    expect(call).toMatch(/weight:\s*['"]100 900['"]/);
    expect(call).toMatch(/display:\s*['"]swap['"]/);
    expect(call).toMatch(/variable:\s*['"]--font-sans['"]/);
  });

  it('loads Geist Mono as --font-mono', () => {
    const call = localFontCallFor(rootLayout, './fonts/geist-mono-latin-var.woff2');
    expect(call).not.toBe('');
    expect(call).toMatch(/weight:\s*['"]100 900['"]/);
    expect(call).toMatch(/display:\s*['"]swap['"]/);
    expect(call).toMatch(/variable:\s*['"]--font-mono['"]/);
  });

  it('no longer loads Inter', () => {
    expect(rootLayout).not.toContain('inter-latin-var.woff2');
  });

  it('still loads Fraunces as --font-display for AdminPageHeader', () => {
    const call = localFontCallFor(rootLayout, './fonts/fraunces-latin-var.woff2');
    expect(call).toMatch(/variable:\s*['"]--font-display['"]/);
  });

  it('puts all three font variables on <html>', () => {
    expect(rootLayout).toMatch(/\$\{geist\.variable\}/);
    expect(rootLayout).toMatch(/\$\{geistMono\.variable\}/);
    expect(rootLayout).toMatch(/\$\{fraunces\.variable\}/);
  });
});

describe('vendored font files match the README table', () => {
  // Rows look like: | `geist-latin-var.woff2` | Geist | `wght 100..900` | `<sha256>` | 12,345 |
  const rows = [
    ...readme.matchAll(
      /^\|\s*`([^`]+\.woff2)`\s*\|[^|]*\|[^|]*\|\s*`([0-9a-f]{64})`\s*\|\s*([\d,]+)\s*\|/gm,
    ),
  ].map((m) => ({ file: m[1]!, sha256: m[2]!, bytes: Number(m[3]!.replace(/,/g, '')) }));

  it('lists every vendored woff2', () => {
    const listed = rows.map((r) => r.file).sort();
    const onDisk = fs.readdirSync(FONTS_DIR).filter((f) => f.endsWith('.woff2')).sort();
    expect(listed).toEqual(onDisk);
    expect(listed).toContain('geist-latin-var.woff2');
    expect(listed).toContain('geist-mono-latin-var.woff2');
  });

  it.each(['geist-latin-var.woff2', 'geist-mono-latin-var.woff2', 'fraunces-latin-var.woff2'])(
    '%s exists with the recorded sha256 and size',
    (file) => {
      const row = rows.find((r) => r.file === file);
      expect(row, `${file} has no README table row`).toBeDefined();
      const bytes = fs.readFileSync(path.join(FONTS_DIR, file));
      expect(sha256(bytes)).toBe(row!.sha256);
      expect(bytes.length).toBe(row!.bytes);
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
    },
  );

  it.each(['geist-latin-var.woff2', 'geist-mono-latin-var.woff2'])(
    '%s is byte-identical to the apps/web copy',
    (file) => {
      const admin = fs.readFileSync(path.join(FONTS_DIR, file));
      const web = fs.readFileSync(path.join(WEB_FONTS_DIR, file));
      expect(sha256(admin)).toBe(sha256(web));
    },
  );

  it('ships the Geist licence', () => {
    const licence = fs.readFileSync(path.join(FONTS_DIR, 'OFL-Geist.txt'), 'utf8');
    expect(licence).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });
});
