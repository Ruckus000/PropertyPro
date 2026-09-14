/**
 * Guard for the defect that made every authored document and every set of
 * meeting minutes unpublishable in production, with all 30 guards, typecheck,
 * lint and the localci suite green.
 *
 * `render-pdf.ts` declared its own structural type for the chromium package:
 *
 *     executablePath: () => Promise<string>;   // zero arguments
 *
 * and called `chromium.executablePath()` with none. That is correct for
 * `@sparticuz/chromium`, which SHIPS the browser binary and resolves it from
 * `<package>/bin`. It is never correct for `@sparticuz/chromium-min`, which
 * ships no binary — the dependency that was actually installed. The
 * hand-written type could not catch the mismatch because it described an API
 * that does not exist (the real `executablePath` takes one parameter), so
 * nothing failed until a real user pressed Publish.
 *
 * These tests exercise the REAL package. Mocking `executablePath` would
 * reproduce exactly the blind spot that caused the outage.
 *
 * WHY THE FIRST TEST LOOKS AT THE FILESYSTEM RATHER THAN CALLING
 * `executablePath()`: both packages short-circuit on a warm cache —
 *
 *     if (existsSync("/tmp/chromium") === true) return "/tmp/chromium";
 *
 * — which is the first statement in either implementation. So a test that only
 * calls `executablePath()` PASSES UNDER THE BUG whenever something else has
 * already populated /tmp, and its result depends on the order tests ran in.
 * That was the first version of this file, and its revert-check came back
 * green. `bin/chromium.br` is the property that actually distinguishes the two
 * packages, and it cannot be faked by ambient state.
 */
import { createRequire } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtmlToPdf } from '@/lib/documents/render-pdf';

// Cold start decompresses ~60MB of Brotli to /tmp before Chromium launches.
const CHROMIUM_TIMEOUT_MS = 120_000;

describe('renderHtmlToPdf', () => {
  it('is backed by a chromium package that ships its own binary', () => {
    const require_ = createRequire(import.meta.url);

    // Resolve the package the same way the package resolves itself:
    // `join(__dirname, '..', 'bin')` from build/index.js.
    const entry = require_.resolve('@sparticuz/chromium');
    const binDir = join(dirname(entry), '..', 'bin');

    expect(
      existsSync(binDir),
      `${binDir} does not exist — the installed chromium package ships no binary, ` +
        'so the no-argument executablePath() call in render-pdf.ts cannot resolve one',
    ).toBe(true);

    const brotli = join(binDir, 'chromium.br');
    expect(existsSync(brotli), `${brotli} is missing`).toBe(true);
    expect(statSync(brotli).size).toBeGreaterThan(1_000_000);
  });

  it('renders HTML to a real PDF byte stream', async () => {
    const pdf = await renderHtmlToPdf({
      html: '<!doctype html><html><body><h1>Minutes</h1><p>Quorum met.</p></body></html>',
    });

    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.byteLength).toBeGreaterThan(0);

    // `%PDF-` magic bytes: proves Chromium actually produced a document rather
    // than the helper returning an empty or placeholder buffer.
    expect(Buffer.from(pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
  }, CHROMIUM_TIMEOUT_MS);
});
