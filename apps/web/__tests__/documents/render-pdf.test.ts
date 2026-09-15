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
import { hardenChromiumArgs, renderHtmlToPdf } from '@/lib/documents/render-pdf';

// Cold start decompresses ~60MB of Brotli to /tmp before Chromium launches.
const CHROMIUM_TIMEOUT_MS = 120_000;

/**
 * @sparticuz/chromium ships a Linux-x64 binary and nothing else, so the render
 * case cannot run on a macOS/arm64 dev machine. This file runs in the `node`
 * unit project (vitest.shared.ts), which localci executes as suite step 5 — so
 * leaving it ungated reds `localci/suite` after every push from such a machine.
 *
 * Follows the house pattern for a capability-gated test — a ternary-selected
 * runner, as in __tests__/finance/stripe-contract.test.ts — rather than
 * `it.skipIf`, which this repo uses only twice and never on platform.
 *
 * The two cheap assertions below stay UNCONDITIONAL: they are
 * platform-independent and they are what actually catches the regression class.
 * The render is confirmation, not the guard.
 */
const canRunBundledChromium =
  (process.platform === 'linux' && process.arch === 'x64')
  || Boolean(process.env.PUPPETEER_EXECUTABLE_PATH?.trim());
const itRenders = canRunBundledChromium ? it : it.skip;

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

  itRenders('renders HTML to a real PDF byte stream', async () => {
    const pdf = await renderHtmlToPdf({
      html: '<!doctype html><html><body><h1>Minutes</h1><p>Quorum met.</p></body></html>',
    });

    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.byteLength).toBeGreaterThan(0);

    // `%PDF-` magic bytes: proves Chromium actually produced a document rather
    // than the helper returning an empty or placeholder buffer.
    expect(Buffer.from(pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
  }, CHROMIUM_TIMEOUT_MS);

  // ---------------------------------------------------------------------------
  // Launch hardening.
  //
  // This browser renders author-supplied HTML in a process holding
  // SUPABASE_SERVICE_ROLE_KEY, and it cannot be sandboxed on Lambda. Two of
  // @sparticuz/chromium's stock args are unnecessary for PDF rendering and
  // must not be inherited.
  // ---------------------------------------------------------------------------

  it('does not launch Chromium with web security disabled', async () => {
    const mod = (await import('@sparticuz/chromium')) as unknown as {
      default?: { args: string[] };
      args: string[];
    };
    const stockArgs = (mod.default ?? mod).args;

    // The three members of upstream's `insecureFlags` group this renderer does
    // not need. Guard the guard: if upstream ever stops shipping one, this test
    // would pass for the wrong reason and the filter could be deleted unnoticed.
    const removed = [
      '--allow-running-insecure-content',
      '--disable-site-isolation-trials',
      '--disable-web-security',
    ];
    for (const flag of removed) {
      expect(stockArgs, `upstream no longer ships ${flag}`).toContain(flag);
    }

    const hardened = hardenChromiumArgs(stockArgs);
    for (const flag of removed) {
      expect(hardened).not.toContain(flag);
    }

    // Everything else survives — this is a filter, not a rewrite. The other
    // three members of the same upstream group MUST remain: Lambda has no user
    // namespaces, and --no-zygote pairs with the retained --single-process.
    for (const kept of ['--no-sandbox', '--disable-setuid-sandbox', '--no-zygote']) {
      expect(hardened).toContain(kept);
    }
    expect(hardened).toHaveLength(stockArgs.length - removed.length);
  }, CHROMIUM_TIMEOUT_MS);

  itRenders.each([
    ['empty', ''],
    ['whitespace', '   '],
  ])(
    'treats a %s PUPPETEER_EXECUTABLE_PATH as unset rather than launching with it',
    async (_label, value) => {
      // `.env.example` is copied to `.env.local` (scripts/setup.sh says to), and
      // a bare `KEY=` line assigns the EMPTY STRING, not undefined. Read with
      // `??` that short-circuits, and puppeteer launches with executablePath: ''
      // — the same failure shape as the outage this module was fixed for. Hence
      // `?.trim() || undefined`.
      const previous = process.env.PUPPETEER_EXECUTABLE_PATH;
      process.env.PUPPETEER_EXECUTABLE_PATH = value;
      try {
        const pdf = await renderHtmlToPdf({ html: '<p>Budget</p>' });
        expect(Buffer.from(pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
      } finally {
        if (previous === undefined) delete process.env.PUPPETEER_EXECUTABLE_PATH;
        else process.env.PUPPETEER_EXECUTABLE_PATH = previous;
      }
    },
    CHROMIUM_TIMEOUT_MS,
  );
});
