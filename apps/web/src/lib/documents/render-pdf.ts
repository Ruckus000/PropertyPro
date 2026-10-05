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
 * VERSIONS ARE PINNED AS A PAIR, exactly. On Vercel the binary needs the
 * package's bundled AL2023 libraries (libnss3 & co.), which it only unpacks
 * when it recognises the platform; 131 had no Vercel check, so every publish
 * died with "libnss3.so: cannot open shared object file" (PROPERTY-PRO-1W).
 * Keep this browser CURRENT: it renders author HTML unsandboxed. Today that
 * is @sparticuz/chromium 153.0.0 with puppeteer-core 25.11.0, the release
 * built against Chrome 153 (upstream's own devDependency is ^25.0.4). A
 * caret would let puppeteer drift to a newer Chrome, and upstream breaks at
 * PATCH level, so pin both exactly and move them together. Both need Node
 * >=22.17, which is why this waited for CI to reach Node 24 (.nvmrc). After
 * any bump, re-run a real production publish; CI cannot see this class of
 * failure (see the VERCEL=1 test in __tests__/documents/render-pdf.test.ts).
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
 * The binaries ship via `outputFileTracingIncludes` in next.config.ts. Up to
 * 143 nft traced them on its own; from 149 the package is ESM-only and nft
 * cannot follow its `import.meta.url` bin lookup, so the route silently
 * deployed without a browser. The include resolves the real pnpm store path;
 * listing the same files through the apps/web/node_modules symlink as well
 * doubles them (measured 82.9 → 146.0 MB at 143). After any bump, check the
 * route's .nft.json lists bin/*.br exactly once.
 *
 * Cold-start can run 10–18 seconds on Vercel; subsequent calls within the
 * function's warm window are fast. Callers must surface a clear loading
 * state to the user.
 *
 * LOCAL DEVELOPMENT: the package ships ONE binary, Linux x64. On macOS (or any
 * other OS, or arm64) it cannot run at all — the launch dies with `spawn ENOEXEC` —
 * so PUPPETEER_EXECUTABLE_PATH is mandatory there, not a preference. Without
 * it, renderHtmlToPdf refuses up front with a message that says so. That
 * override launches the developer's own Chrome with `desktopChromeArgs()`, not
 * the Lambda flags: those force `--single-process` and a second, conflicting
 * `--headless='shell'` onto a browser that was never built for them. The agent
 * sandbox (scripts/agent-env.sh) passes the variable through and detects
 * Chrome on macOS.
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
  headless?: boolean | 'shell';
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

/**
 * Launch args for a developer's own Chrome (PUPPETEER_EXECUTABLE_PATH set).
 *
 * The Lambda set from @sparticuz/chromium is wrong here. Measured on Chromium
 * 141: it adds `--headless='shell'` AFTER puppeteer's `--headless=new`, so the
 * `headless: true` below was silently overridden, and `--single-process`
 * collapsed the browser to one process (0 children vs 3). Linux tolerated
 * that; desktop Chrome does not support single-process mode, and macOS is
 * where this override is actually needed.
 *
 * A desktop Chrome also HAS a working sandbox, so keep it — except as root,
 * where Chrome refuses to start without `--no-sandbox` (crbug.com/638180).
 * `--font-render-hinting=none` is kept from the Lambda set for glyph parity.
 */
export function desktopChromeArgs(uid: number | undefined = process.getuid?.()): string[] {
  const args = ['--font-render-hinting=none'];
  if (uid === 0) args.push('--no-sandbox');
  return args;
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

  // `|| undefined`, NOT `??`. An env var that is present but EMPTY is how this
  // breaks: dotenv assigns '' for a bare `KEY=` line, `'' ?? x` short-circuits
  // to '', and puppeteer then launches with executablePath: '' and fails —
  // the same shape as the outage this module was fixed for. .env.example keeps
  // the key commented out for the same reason.
  const explicitExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || undefined;

  // Refuse before inflating ~63 MB of a binary this host cannot execute. On
  // Vercel (linux/x64) this never fires; on a Mac it replaces `spawn ENOEXEC`.
  if (!explicitExecutablePath && (process.platform !== 'linux' || process.arch !== 'x64')) {
    throw new Error(
      `The bundled PDF renderer (@sparticuz/chromium) is a Linux x64 binary and cannot run on ` +
        `${process.platform}/${process.arch}. Set PUPPETEER_EXECUTABLE_PATH to a local Chrome ` +
        '(see .env.example); pnpm agent:live:web detects one on macOS.',
    );
  }

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

  // Production: @sparticuz/chromium expands its bundled binary to /tmp and
  // returns that path. Local dev: the developer's own Chrome (see header).
  const browser = (await puppeteer.launch(
    explicitExecutablePath
      ? {
          args: desktopChromeArgs(),
          defaultViewport: { width: 1240, height: 1754 },
          executablePath: explicitExecutablePath,
          // Chrome 132 removed the old headless mode, so a desktop Chrome needs `true`.
          headless: true,
        }
      : {
          args: hardenChromiumArgs(chromium.args),
          defaultViewport: { width: 1240, height: 1754 },
          executablePath: await chromium.executablePath(),
          // The bundled binary is chrome-headless-shell, which only speaks
          // 'shell' (upstream README, v137+).
          headless: 'shell',
        },
  )) as unknown as PuppeteerBrowser;

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
