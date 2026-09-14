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
 * `export const memory`. apps/web/vercel.json has no `functions` block today,
 * so this route runs at Vercel's default; that block is the lever if Chromium
 * ever OOMs.
 *
 * SIZE: the full package puts ~63 MB of Brotli binaries in the function.
 * Measured 2026-09-14, the publish route traces to 82.9 MB against Vercel's
 * 250 MB uncompressed limit. Upstream only suggests reaching for -min "if your
 * vendor does not allow large deployments" and names no Vercel figure, so the
 * "50MB compressed" number this file used to carry was never authoritative.
 *
 * Do NOT add the package to `outputFileTracingIncludes` to "make sure" the
 * binaries ship. nft already traces them through the serverExternalPackage
 * (verified by measuring the route's .nft.json), and adding it lists the SAME
 * file twice — once at the pnpm store path, once through the
 * apps/web/node_modules symlink — taking the traced total from 82.9 MB to
 * 146.0 MB. Measure the trace instead of pinning it.
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
 * The subset of @sparticuz/chromium's own `insecureFlags` group that this
 * renderer does not need. Upstream groups six together (build/index.js):
 *
 *   --allow-running-insecure-content   removed here
 *   --disable-site-isolation-trials    removed here
 *   --disable-web-security             removed here
 *   --disable-setuid-sandbox           KEPT — required
 *   --no-sandbox                       KEPT — required
 *   --no-zygote                        KEPT — pairs with --single-process
 *
 * The package targets general-purpose serverless scraping; turning HTML into a
 * PDF needs none of the first three, and this browser renders AUTHOR-SUPPLIED
 * HTML, so they come off.
 *
 * BE PRECISE ABOUT WHAT THIS BUYS, because it is less than it looks. Lambda has
 * no user namespaces, so the sandbox flags cannot be removed — and site
 * isolation stays off regardless via `--single-process` and
 * `--disable-features=…IsolateOrigins,site-per-process`, which are load-bearing
 * in serverless Chromium. `launch()` also passes no `env`, so the browser
 * inherits this process's environment, SUPABASE_SERVICE_ROLE_KEY included.
 *
 * So this is not containment. The renderer is not sandboxed and cannot be, which
 * is precisely why `lib/utils/sanitize-authored-html.ts` is load-bearing rather
 * than defence-in-depth: it is the control, not a second layer. Removing these
 * three narrows the attack surface reachable from author HTML; it does not
 * contain a compromised renderer.
 */
const EXCLUDED_CHROMIUM_ARGS = new Set([
  '--allow-running-insecure-content',
  '--disable-site-isolation-trials',
  '--disable-web-security',
]);

export function hardenChromiumArgs(args: readonly string[]): string[] {
  return args.filter((arg) => !EXCLUDED_CHROMIUM_ARGS.has(arg));
}

interface RenderHtmlToPdfOptions {
  html: string;
  /**
   * Budget for the whole call, default 45s, under the route's 60s maxDuration.
   *
   * Precisely: binary inflation and launch SPEND this budget — whatever is left
   * when they finish is what the render gets — but neither is individually
   * interrupted. A hard hang inside `puppeteer.launch()` never reaches the
   * render and still ends at Vercel's maxDuration. Bounding launch itself would
   * mean racing it, which leaks a spawned browser nothing holds a handle to.
   */
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
  // Taken BEFORE the lazy imports, because a cold start inflates ~63 MB of
  // Brotli to /tmp and launches a browser before a single byte is rendered.
  // Passing `timeoutMs` straight to setContent/pdf let that work stack ON TOP
  // of the budget, so a slow cold start overran the route's 60s maxDuration and
  // Vercel killed it with a 504 that carried no error. Spending the same budget
  // from one deadline turns that into a real, reported timeout.
  const deadline = Date.now() + timeoutMs;
  const remainingMs = (): number => Math.max(1_000, deadline - Date.now());

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
  //
  // `|| undefined`, NOT `??`. An env var that is present but EMPTY is how this
  // breaks: dotenv assigns '' for a bare `KEY=` line, `'' ?? x` short-circuits
  // to '', and puppeteer then launches with executablePath: '' and fails —
  // the same shape as the outage this module was fixed for. .env.example keeps
  // the key commented out for the same reason.
  const explicitExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || undefined;
  const executablePath: string =
    explicitExecutablePath ?? (await chromium.executablePath());

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
      timeout: remainingMs(),
    });

    const pdfData = (await page.pdf({
      format: opts.format ?? 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      timeout: remainingMs(),
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
