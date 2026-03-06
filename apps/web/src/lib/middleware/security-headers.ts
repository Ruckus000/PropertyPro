/**
 * Security headers for all HTTP responses.
 *
 * P4-56: Provides CORS origin validation and security header builders
 * used by Next.js middleware to harden every response.
 *
 * CORS strategy:
 * - Requests with no Origin header are same-origin or server-to-server — allowed.
 * - Requests from localhost are allowed for local development.
 * - Requests from the production domain and its subdomains are allowed.
 * - Requests from the configured NEXT_PUBLIC_APP_URL are allowed.
 * - All other origins are rejected (CORS headers not set).
 *
 * CSP strategy:
 * - Applied to all non-API responses (HTML pages).
 * - 'unsafe-inline' for scripts is required by Next.js App Router hydration.
 * - Nonces or hash-based CSP are the recommended upgrade path when strict mode is needed.
 */

const PRODUCTION_DOMAIN = 'propertyprofl.com';

/**
 * Returns space-separated admin origin(s) for CSP frame-ancestors in preview mode.
 * Uses ADMIN_ORIGIN env var if set, otherwise falls back to known defaults.
 */
function getAdminOrigins(): string {
  const envOrigin = process.env.ADMIN_ORIGIN;
  if (envOrigin) return envOrigin;

  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3001 http://127.0.0.1:3001';
  }

  return 'https://admin.propertyprofl.com';
}

/**
 * Returns true when the given Origin header value is an allowed origin.
 * Returns false for origins not on the allowlist.
 */
export function isAllowedOrigin(origin: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }

  // Local development
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;

  // Production domain and subdomains
  if (hostname === PRODUCTION_DOMAIN || hostname.endsWith(`.${PRODUCTION_DOMAIN}`)) return true;

  // Configured app URL (e.g., Vercel preview deployments)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      if (hostname === new URL(appUrl).hostname) return true;
    } catch {
      // Invalid NEXT_PUBLIC_APP_URL — ignore
    }
  }

  return false;
}

/**
 * Build CORS response headers for a given Origin.
 * Returns an empty record when the origin is not in the allowlist so that
 * callers can safely spread the result without leaking permissive CORS.
 */
export function buildCorsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !isAllowedOrigin(origin)) return {};

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
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
export function buildSecurityHeaders(options?: { isPreview?: boolean }): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': options?.isPreview ? 'SAMEORIGIN' : 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'X-DNS-Prefetch-Control': 'off',
  };
}

/**
 * Build the Content-Security-Policy header value for page responses.
 *
 * NOTE: 'unsafe-inline' for script-src is required by Next.js 15 App Router
 * until nonce-based CSP is implemented (tracked as a future hardening item).
 */
export function buildCspHeader(options?: { isPreview?: boolean }): string {
  let supabaseHost: string;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    supabaseHost = url ? new URL(url).host : '*.supabase.co';
  } catch {
    console.error('Invalid NEXT_PUBLIC_SUPABASE_URL for CSP, falling back to wildcard.');
    supabaseHost = '*.supabase.co';
  }

  const directives = [
    "default-src 'self'",
    // 'unsafe-inline' is required for Next.js inline scripts; 'unsafe-eval' for dev HMR
    "script-src 'self' 'unsafe-inline'" +
      (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://${supabaseHost}`,
    `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://*.ingest.sentry.io https://api.stripe.com`,
    "font-src 'self' data:",
    options?.isPreview
      ? `frame-ancestors 'self' ${getAdminOrigins()}`
      : "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];

  return directives.join('; ');
}
