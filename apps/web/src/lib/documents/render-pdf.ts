/**
 * Server-side HTML→PDF rendering via headless Chromium.
 *
 * Stack: puppeteer-core (no Chrome bundled) + @sparticuz/chromium, which
 * SHIPS the Brotli-compressed browser binary inside the package and expands
 * it to /tmp on first use.
 *
 * Do NOT swap this for @sparticuz/chromium-min without also passing a pack
 * location to `executablePath()`. The -min variant ships no binary at all, so
 * the no-argument call below resolves to a `bin/` directory that does not
 * exist and throws. That is exactly what shipped, and it meant no authored
 * document or set of meeting minutes could ever be published in production.
 *
 * NEVER import this module client-side and NEVER call it from edge runtime
 * — Chromium cannot run on edge. Routes that import this MUST set:
 *
 *   export const runtime = 'nodejs';
 *   export const maxDuration = 60;
 *
 * Memory is NOT a Next.js route segment config — there is no
 * `export const memory`. Configure it per-function in apps/web/vercel.json.
 *
 * Cold-start can run 10–18 seconds on Vercel; subsequent calls within the
 * function's warm window are fast. Callers must surface a clear loading
 * state to the user.
 */
import 'server-only';

// puppeteer-core's types resolve at runtime; we lazy-import to keep the
// module out of edge bundles.
type PuppeteerBrowser = {
  newPage: () => Promise<PuppeteerPage>;
  close: () => Promise<void>;
};
type PuppeteerPage = {
  setContent: (html: string, options?: { waitUntil?: string; timeout?: number }) => Promise<void>;
  pdf: (options: PdfOptions) => Promise<Uint8Array | Buffer>;
  emulateMediaType: (type: 'screen' | 'print' | null) => Promise<void>;
  setViewport: (vp: { width: number; height: number; deviceScaleFactor?: number }) => Promise<void>;
};
type PdfOptions = {
  format?: 'A4' | 'Letter';
  printBackground?: boolean;
  preferCSSPageSize?: boolean;
  timeout?: number;
  margin?: { top?: string; right?: string; bottom?: string; left?: string };
};

type ChromiumApi = {
  args: string[];
  // The parameter is NOT optional-by-convenience: @sparticuz/chromium resolves
  // its bundled binary when omitted, while -min REQUIRES a path or pack URL.
  // Typing this as zero-argument is what let the broken call compile.
  executablePath: (input?: string) => Promise<string>;
};

type PuppeteerLaunchOptions = {
  args?: string[];
  executablePath?: string;
  headless?: boolean;
  defaultViewport?: { width: number; height: number; deviceScaleFactor?: number };
};

type PuppeteerApi = {
  launch: (opts: PuppeteerLaunchOptions) => Promise<PuppeteerBrowser>;
};

/**
 * Chromium flags that @sparticuz/chromium ships by default but this renderer
 * must not inherit.
 *
 * The package targets general-purpose serverless scraping, so its 49 default
 * args include `--disable-web-security` (same-origin policy OFF) and
 * `--allow-running-insecure-content`. Neither is needed to turn HTML into a
 * PDF, and this browser renders AUTHOR-SUPPLIED HTML in a process whose
 * environment holds SUPABASE_SERVICE_ROLE_KEY — the key that bypasses RLS for
 * every tenant.
 *
 * `--no-sandbox` / `--disable-setuid-sandbox` are deliberately NOT in this
 * list: Lambda has no user namespaces and Chromium will not launch without
 * them. That is exactly why the sanitizer in
 * `lib/utils/sanitize-authored-html.ts` is load-bearing rather than
 * defence-in-depth, and why these two come off.
 */
const EXCLUDED_CHROMIUM_ARGS = new Set([
  '--disable-web-security',
  '--allow-running-insecure-content',
]);

export function hardenChromiumArgs(args: readonly string[]): string[] {
  return args.filter((arg) => !EXCLUDED_CHROMIUM_ARGS.has(arg));
}

interface RenderHtmlToPdfOptions {
  html: string;
  /** Hard ceiling on the entire operation; default 45s (Vercel cap is 60). */
  timeoutMs?: number;
  format?: 'A4' | 'Letter';
}

/**
 * Render a self-contained HTML string to a PDF byte array.
 *
 * The HTML must be self-contained: inline CSS only, no external assets
 * other than Supabase Storage image URLs (the publish handler is
 * responsible for ensuring this — see render-authored-html.ts).
 */
export async function renderHtmlToPdf(opts: RenderHtmlToPdfOptions): Promise<Uint8Array> {
  const timeoutMs = opts.timeoutMs ?? 45_000;

  // Lazy-import to keep these out of bundles that don't render PDFs. The
  // packages export their public API as the module's default; treat both
  // shapes (default-export and namespace-with-.default) safely.
  const chromiumMod = (await import('@sparticuz/chromium')) as unknown as {
    default?: ChromiumApi;
  } & ChromiumApi;
  const puppeteerMod = (await import('puppeteer-core')) as unknown as {
    default?: PuppeteerApi;
  } & PuppeteerApi;
  const chromium: ChromiumApi = chromiumMod.default ?? chromiumMod;
  const puppeteer: PuppeteerApi = puppeteerMod.default ?? puppeteerMod;

  // Detect the executable. @sparticuz/chromium expands its bundled binary to
  // /tmp and returns that path; in local dev a developer may set
  // PUPPETEER_EXECUTABLE_PATH to use system Chrome instead.
  const executablePath: string =
    (process.env.PUPPETEER_EXECUTABLE_PATH as string | undefined) ??
    (await chromium.executablePath());

  const browser = (await puppeteer.launch({
    args: hardenChromiumArgs(chromium.args),
    defaultViewport: { width: 1240, height: 1754 },
    executablePath,
    headless: true,
  })) as unknown as PuppeteerBrowser;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 2 });
    await page.emulateMediaType('print');
    await page.setContent(opts.html, {
      waitUntil: 'networkidle0',
      timeout: timeoutMs,
    });

    const pdfData = (await page.pdf({
      format: opts.format ?? 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      timeout: timeoutMs,
      margin: { top: '1in', right: '1in', bottom: '1in', left: '1in' },
    })) as unknown as Uint8Array | { buffer: ArrayBuffer; byteOffset: number; byteLength: number };

    if (pdfData instanceof Uint8Array) return pdfData;
    return new Uint8Array(pdfData.buffer, pdfData.byteOffset, pdfData.byteLength);
  } finally {
    try {
      await browser.close();
    } catch {
      // ignore — close failures should not mask render results
    }
  }
}
