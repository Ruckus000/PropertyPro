/**
 * Security headers for all HTTP responses — apps/web adapter.
 *
 * P4-56: Provides CORS origin validation and security header builders
 * used by Next.js middleware to harden every response.
 *
 * The builders themselves live in `@propertypro/shared/http` so that
 * `apps/admin` uses the identical implementation. This module is the web
 * app's thin adapter: it supplies web's own hosts, env reads and the
 * `isPreview` toggle, and keeps the exported signatures that web's middleware,
 * the demo-login route and the existing test suite already call.
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
import {
  buildCorsHeaders as buildCorsHeadersShared,
  buildCspHeader as buildCspHeaderShared,
  buildSecurityHeaders as buildSecurityHeadersShared,
  isAllowedOrigin as isAllowedOriginShared,
  isAllowedReferer as isAllowedRefererShared,
  type OriginAllowlistOptions,
} from '@propertypro/shared/http';

const PRODUCTION_DOMAIN = 'getpropertypro.com';

/** Web's origin allowlist. Read lazily so tests can stub NEXT_PUBLIC_APP_URL. */
function allowlist(): OriginAllowlistOptions {
  return {
    productionDomain: PRODUCTION_DOMAIN,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  };
}

/**
 * Returns space-separated admin origin(s) for CSP frame-ancestors in preview mode.
 * Uses ADMIN_ORIGIN env var if set, otherwise falls back to known defaults.
 */
function getAdminOrigins(): string {
  const envOrigin = process.env.ADMIN_ORIGIN;
  if (envOrigin) return envOrigin;

  if (process.env.NODE_ENV === 'development') {
    // Use http://localhost:* to cover any dev port (admin dev server, preview tools, etc.)
    return 'http://localhost:* http://127.0.0.1:*';
  }

  return 'https://pm.getpropertypro.com https://admin.getpropertypro.com';
}

/**
 * Returns true when the given Origin header value is an allowed origin.
 * Returns false for origins not on the allowlist.
 */
export function isAllowedOrigin(origin: string): boolean {
  return isAllowedOriginShared(origin, allowlist());
}

/**
 * Extract the origin from a Referer header value and check against allowlist.
 * Falls back to false for malformed URLs.
 */
export function isAllowedReferer(referer: string): boolean {
  return isAllowedRefererShared(referer, allowlist());
}

/**
 * Build CORS response headers for a given Origin.
 * Returns an empty record when the origin is not in the allowlist so that
 * callers can safely spread the result without leaking permissive CORS.
 */
export function buildCorsHeaders(origin: string | null): Record<string, string> {
  return buildCorsHeadersShared(origin, allowlist());
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
  // In preview mode, CSP frame-ancestors is the authoritative framing policy.
  // X-Frame-Options is omitted because SAMEORIGIN would block the cross-origin
  // admin→web iframe while CSP correctly allows the admin origin.
  return buildSecurityHeadersShared({
    frameOptions: options?.isPreview ? 'omit' : 'DENY',
  });
}

/**
 * Build the Content-Security-Policy header value for page responses.
 *
 * NOTE: 'unsafe-inline' for script-src is required by Next.js 15 App Router
 * until nonce-based CSP is implemented (tracked as a future hardening item).
 */
export function buildCspHeader(options?: { isPreview?: boolean }): string {
  return buildCspHeaderShared({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    frameAncestors: options?.isPreview ? `'self' ${getAdminOrigins()}` : "'none'",
    scriptSrc: ['https://js.stripe.com'],
    connectSrc: ['https://*.ingest.sentry.io', 'https://api.stripe.com'],
    frameSrc: ['https://js.stripe.com', 'https://hooks.stripe.com'],
    allowUnsafeEval: process.env.NODE_ENV === 'development',
  });
}
