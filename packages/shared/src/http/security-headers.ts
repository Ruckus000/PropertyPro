/**
 * Security headers and CORS allowlisting, shared by every app's middleware.
 *
 * These started in `apps/web` and moved here when `apps/admin` was found to be
 * serving NO security headers at all — no CSP, no X-Frame-Options, no nosniff —
 * despite being the console that holds the service-role key and can impersonate
 * any user. Duplicating the builders is what let the two apps' header contracts
 * drift apart in the first place.
 *
 * The module is deliberately app-agnostic: every host, domain and toggle is a
 * PARAMETER rather than a `process.env` read, because the two apps need
 * genuinely different values (admin frames the web app's demo previews; web
 * talks to Stripe; only web has a "preview" mode that relaxes framing). Each
 * app owns a thin adapter that supplies its own arguments.
 *
 * Like the error hierarchy next door, this is exported from
 * `@propertypro/shared/http` and NOT from the root barrel: 31 web test files
 * mock `@propertypro/shared` with bare factories, so a root-barrel export would
 * arrive as `undefined` inside them.
 *
 * No dependencies (no Next, no zod) — it builds plain strings and records.
 */

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

export interface OriginAllowlistOptions {
  /** Apex domain whose subdomains are trusted, e.g. `getpropertypro.com`. */
  productionDomain: string;
  /** Additional exact origin to trust, typically the app's own public URL. */
  appUrl?: string;
  /** Allow `localhost` / `127.0.0.1` on any port. Defaults to true. */
  allowLocalhost?: boolean;
}

/**
 * Returns true when the given Origin header value is an allowed origin.
 * Returns false for origins not on the allowlist, and for unparseable input.
 */
export function isAllowedOrigin(origin: string, options: OriginAllowlistOptions): boolean {
  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }

  // Local development
  if (options.allowLocalhost !== false && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    return true;
  }

  // Production domain and subdomains
  const { productionDomain } = options;
  if (hostname === productionDomain || hostname.endsWith(`.${productionDomain}`)) return true;

  // Configured app URL (e.g., Vercel preview deployments)
  if (options.appUrl) {
    try {
      if (hostname === new URL(options.appUrl).hostname) return true;
    } catch {
      // Invalid appUrl — ignore
    }
  }

  return false;
}

/**
 * Extract the origin from a Referer header value and check against allowlist.
 * Falls back to false for malformed URLs.
 */
export function isAllowedReferer(referer: string, options: OriginAllowlistOptions): boolean {
  try {
    const url = new URL(referer);
    return isAllowedOrigin(url.origin, options);
  } catch {
    return false;
  }
}

/**
 * Build CORS response headers for a given Origin.
 * Returns an empty record when the origin is not in the allowlist so that
 * callers can safely spread the result without leaking permissive CORS.
 */
export function buildCorsHeaders(
  origin: string | null,
  options: OriginAllowlistOptions,
): Record<string, string> {
  if (!origin || !isAllowedOrigin(origin, options)) return {};

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

export interface SecurityHeaderOptions {
  /**
   * `X-Frame-Options` value, or `'omit'` to leave the header off entirely.
   *
   * Omit it when CSP `frame-ancestors` is the authoritative framing policy and
   * needs to allow a CROSS-ORIGIN framer: `SAMEORIGIN` would block that frame,
   * and `X-Frame-Options` has no allowlist syntax that browsers still honour.
   *
   * Defaults to `'DENY'` — deny-by-default is correct for everything except an
   * explicitly framed surface.
   */
  frameOptions?: 'DENY' | 'SAMEORIGIN' | 'omit';
}

/**
 * Build security headers applied to every response.
 *
 * CSP is intentionally omitted here because it must be applied selectively:
 * - HTML page responses: include CSP.
 * - API/JSON responses: CSP is not applicable; X-Content-Type-Options suffices.
 *
 * Call buildCspHeader() separately and add it to page responses.
 */
export function buildSecurityHeaders(options?: SecurityHeaderOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'X-DNS-Prefetch-Control': 'off',
  };

  const frameOptions = options?.frameOptions ?? 'DENY';
  if (frameOptions !== 'omit') {
    headers['X-Frame-Options'] = frameOptions;
  }

  return headers;
}

// ---------------------------------------------------------------------------
// Content-Security-Policy
// ---------------------------------------------------------------------------

export interface CspOptions {
  /**
   * The Supabase project URL. Its SCHEME is preserved rather than assumed to be
   * https: a hosted project is https (so this is a no-op there), but a local
   * stack is `http://127.0.0.1:<port>`, and hardcoding https silently blocked
   * the browser from reaching Supabase Auth at all (`Failed to fetch` on
   * /auth/v1/user), which broke client-side auth in every local e2e run.
   */
  supabaseUrl?: string;
  /** `frame-ancestors` value. Defaults to `'none'` (not framable at all). */
  frameAncestors?: string;
  /** Extra `script-src` hosts beyond `'self' 'unsafe-inline'`. */
  scriptSrc?: string[];
  /** Extra `connect-src` hosts beyond `'self'` and the Supabase origin. */
  connectSrc?: string[];
  /** Extra `frame-src` hosts beyond `'self'` and the Supabase origin. */
  frameSrc?: string[];
  /** Extra `img-src` hosts beyond `'self' data: blob:` and the Supabase origin. */
  imgSrc?: string[];
  /** Add `'unsafe-eval'` to script-src. Required only by dev-mode HMR. */
  allowUnsafeEval?: boolean;
}

/**
 * Build the Content-Security-Policy header value for page responses.
 *
 * NOTE: 'unsafe-inline' for script-src is required by Next.js 15 App Router
 * until nonce-based CSP is implemented (tracked as a future hardening item).
 * 'unsafe-inline' for style-src is likewise required — both apps ship inline
 * style attributes.
 */
export function buildCspHeader(options?: CspOptions): string {
  let supabaseOrigin: string;
  let supabaseHost: string;
  let supabaseWsScheme: 'ws' | 'wss';
  try {
    const raw = options?.supabaseUrl;
    const url = raw ? new URL(raw) : null;
    supabaseHost = url ? url.host : '*.supabase.co';
    supabaseOrigin = url ? url.origin : 'https://*.supabase.co';
    supabaseWsScheme = url?.protocol === 'http:' ? 'ws' : 'wss';
  } catch {
    console.error('Invalid Supabase URL for CSP, falling back to wildcard.');
    supabaseHost = '*.supabase.co';
    supabaseOrigin = 'https://*.supabase.co';
    supabaseWsScheme = 'wss';
  }

  const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ');

  const directives = [
    "default-src 'self'",
    join(
      "script-src 'self' 'unsafe-inline'",
      options?.scriptSrc?.join(' '),
      options?.allowUnsafeEval ? "'unsafe-eval'" : undefined,
    ),
    "style-src 'self' 'unsafe-inline'",
    join(`img-src 'self' data: blob: ${supabaseOrigin}`, options?.imgSrc?.join(' ')),
    join(
      `connect-src 'self' ${supabaseOrigin} ${supabaseWsScheme}://${supabaseHost}`,
      options?.connectSrc?.join(' '),
    ),
    join(`frame-src 'self' ${supabaseOrigin}`, options?.frameSrc?.join(' ')),
    "font-src 'self' data:",
    "worker-src 'self'",
    `frame-ancestors ${options?.frameAncestors ?? "'none'"}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];

  return directives.join('; ');
}
