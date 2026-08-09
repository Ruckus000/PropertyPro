/**
 * Rate limit configuration per route category.
 *
 * Different endpoint categories have different rate limits based on
 * their sensitivity and expected usage patterns.
 *
 * Key resolution:
 * - Unauthenticated routes: keyed by IP address
 * - Authenticated routes: keyed by user ID
 * - Webhook routes: exempt from rate limiting
 */

import type { NextRequest } from 'next/server';
import { type RateLimitResult, getRateLimiter } from './rate-limiter';
import { checkDistributedRateLimit, isDistributedLimiterConfigured } from './distributed-rate-limiter';

/** Rate limit tier defining requests per window. */
export interface RateLimitTier {
  /** Maximum requests allowed in the window. */
  limit: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

/** Route category for rate limiting purposes. */
export type RouteCategory =
  | 'auth'
  | 'write'
  | 'read'
  | 'public'
  | 'page'
  | 'esign-sign'
  | 'site-uploads'
  | 'webhook';

/** Rate limit tiers per route category. */
const RATE_LIMIT_TIERS: Record<RouteCategory, RateLimitTier> = {
  /** Auth routes (login, signup, password reset): 10 req/min per IP */
  auth: { limit: 10, windowMs: 60_000 },

  /** Write routes (POST, PATCH, DELETE): 30 req/min per user */
  write: { limit: 30, windowMs: 60_000 },

  /** Read routes (GET): 100 req/min per user */
  read: { limit: 100, windowMs: 60_000 },

  /** Public UNAUTHENTICATED API endpoints: 60 req/min per IP */
  public: { limit: 60, windowMs: 60_000 },

  /**
   * HTML page navigations: EXEMPT (see `checkRateLimit`).
   *
   * These used to fall into `public` and be throttled at 60/min **per IP**.
   * That was the wrong control on the wrong key. Page requests are already
   * behind session auth and RLS, so the tier protected nothing an attacker
   * could reach; meanwhile every user in a management office shares one NAT
   * address, and Next.js link prefetching spends that budget quickly. It
   * throttled the customer, not the threat — the app's own E2E suite tripped
   * it. A 429 also arrived as raw JSON in the browser, because middleware has
   * no page to render.
   *
   * Abuse of authenticated pages is bounded by the `read`/`write` API tiers,
   * which are keyed by user id and are where the actual data access happens.
   * The tier is kept in the table (rather than deleted) so `classifyRoute`
   * stays total and the exemption is a visible decision, not an omission.
   */
  page: { limit: 0, windowMs: 0 },

  /**
   * E-sign unauthenticated signing routes: 10 req/min per IP.
   * Tighter than `public` because the token-based signing flow is a
   * high-value abuse target (repeated signature submission attempts).
   * The single-use server-side token validation provides the primary
   * defense; this tier is a secondary throttle.
   */
  'esign-sign': { limit: 10, windowMs: 60_000 },

  /**
   * Site asset upload routes (presign + finalize): 20 requests per 5
   * minutes per authenticated user. Per spec §8.4 the intent is "per
   * community"; the existing limiter keys by user, which is approximately
   * equivalent because PMs only have membership in communities they manage.
   * A future infrastructure pass may add community-keyed limits.
   */
  'site-uploads': { limit: 20, windowMs: 5 * 60_000 },

  /** Webhook routes: exempt (Stripe retries need to succeed) */
  webhook: { limit: 0, windowMs: 0 },
};

/** Auth route path prefixes (login, signup, password reset). */
const AUTH_RATE_LIMIT_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/signup',
  '/api/v1/auth/register',
  '/api/v1/auth/password-reset',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/resend-verification',
  '/api/v1/reauth/verify',
  '/auth/login',
  '/signup',
  '/auth/signup',
  '/auth/register',
  '/auth/password-reset',
  '/auth/forgot-password',
];

/** Webhook route path prefixes (exempt from rate limiting). */
const WEBHOOK_PATHS = [
  '/api/v1/webhooks/',
  '/api/webhooks/',
];

/**
 * E-sign unauthenticated signing route prefix.
 * These routes are token-authenticated (no session) and have their own
 * tighter tier — they must be matched before the generic API classification.
 */
const ESIGN_SIGN_PATH_PREFIX = '/api/v1/esign/sign/';

/**
 * Site asset upload route prefixes (PR #2). Matched before the generic
 * write/read classification so the tighter site-uploads tier applies.
 */
const SITE_UPLOAD_PATH_PREFIXES = [
  '/api/v1/site/uploads/',
  '/api/v1/site/images/',
];

/** API route prefix for identifying API requests. */
const API_PREFIX = '/api/';

/**
 * Classify a request into a rate limit category based on its path and method.
 */
export function classifyRoute(pathname: string, method: string): RouteCategory {
  // Webhook routes are always exempt
  if (WEBHOOK_PATHS.some((prefix) => pathname.startsWith(prefix))) {
    return 'webhook';
  }

  // Auth routes have strict limits
  if (AUTH_RATE_LIMIT_PATHS.some((prefix) => pathname.startsWith(prefix))) {
    return 'auth';
  }

  // E-sign signing routes (unauthenticated, token-based) — must be matched
  // before the generic API_PREFIX classification below.
  if (pathname.startsWith(ESIGN_SIGN_PATH_PREFIX)) {
    return 'esign-sign';
  }

  // Site asset upload routes — tighter tier than generic write.
  if (SITE_UPLOAD_PATH_PREFIXES.some((p) => pathname.startsWith(p))) {
    return 'site-uploads';
  }

  // Public unauthenticated API endpoints
  // - transparency: tenant opt-in gated at handler level
  // - provisioning-status: polled at 2s intervals during signup provisioning
  if (
    (pathname === '/api/v1/transparency' && method === 'GET') ||
    (pathname.startsWith('/api/v1/auth/provisioning-status') && method === 'GET')
  ) {
    return 'public';
  }

  // API routes are classified by HTTP method
  if (pathname.startsWith(API_PREFIX)) {
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return 'read';
    }
    return 'write';
  }

  // Everything else is an HTML page navigation. Kept DISTINCT from `public`:
  // `public` means "unauthenticated API endpoint" (the four enumerated above)
  // and stays IP-throttled; `page` is exempt. Collapsing the two is what put
  // every authenticated page view into a 60/min per-IP bucket.
  return 'page';
}

/**
 * Extract the client IP address from a request.
 *
 * Checks standard proxy headers in order of preference.
 * Falls back to 'unknown' if no IP can be determined.
 */
export function extractClientIp(request: NextRequest): string {
  // Vercel-specific header
  const vercelIp = request.headers.get('x-real-ip');
  if (vercelIp) return vercelIp;

  // Standard proxy header (first IP in chain)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  return 'unknown';
}

/**
 * Build the rate limit key for a request.
 *
 * - Auth/public routes: keyed by IP address with category prefix
 * - Authenticated API routes: keyed by user ID with category prefix
 * - Falls back to IP if no user ID is available
 */
export function buildRateLimitKey(
  category: RouteCategory,
  ip: string,
  userId: string | null,
): string {
  if (category === 'auth' || category === 'public' || category === 'esign-sign') {
    return `rl:${category}:ip:${ip}`;
  }

  // Authenticated routes: prefer user ID, fall back to IP
  const identifier = userId || `ip:${ip}`;
  return `rl:${category}:${identifier}`;
}

/**
 * Get the rate limit tier for a given route category.
 */
export function getTier(category: RouteCategory): RateLimitTier {
  return RATE_LIMIT_TIERS[category];
}

/** Result of rate limit check including category metadata. */
export interface RateLimitCheckResult extends RateLimitResult {
  /** The route category that was matched. */
  category: RouteCategory;
}

/** Tiers backed by Redis so the limit holds across Edge isolates. */
const DISTRIBUTED_CATEGORIES: ReadonlySet<RouteCategory> = new Set<RouteCategory>([
  'auth',
  'esign-sign',
]);

/**
 * Check rate limit for a request.
 *
 * Async because the security-critical tiers (`auth`, `esign-sign`) consult
 * Redis — a per-isolate counter cannot bound an attacker who just keeps
 * retrying. Every other tier resolves in-memory without awaiting I/O.
 *
 * @param request - The incoming Next.js request
 * @param userId - The authenticated user ID, or null for unauthenticated requests
 * @returns Rate limit check result, or null if the route is exempt
 */
export async function checkRateLimit(
  request: NextRequest,
  userId: string | null,
): Promise<RateLimitCheckResult | null> {
  // Tenant subdomain Playwright polls the webServer URL aggressively; exempt that
  // dev-only server so readiness checks are not rate-limited into 429 timeouts.
  if (process.env.PLAYWRIGHT_TENANT_E2E === '1') {
    return null;
  }

  const { pathname } = request.nextUrl;
  const method = request.method;
  const category = classifyRoute(pathname, method);

  // Webhook routes are exempt (Stripe retries must succeed).
  // HTML page navigations are exempt — see the `page` tier comment above.
  if (category === 'webhook' || category === 'page') {
    return null;
  }

  const tier = getTier(category);
  const ip = extractClientIp(request);
  const key = buildRateLimitKey(category, ip, userId);

  if (DISTRIBUTED_CATEGORIES.has(category)) {
    const distributed = await checkDistributedRateLimit(key, tier.limit, tier.windowMs);
    // null => Redis unconfigured or unreachable. Fall through to the in-memory
    // limiter rather than allowing the request: degrade, don't fail open.
    if (distributed) {
      return { ...distributed, category };
    }
  }

  const limiter = getRateLimiter();
  const result = limiter.check(key, tier.limit, tier.windowMs);

  return { ...result, category };
}

/**
 * Minimal 429 document for browser navigations.
 *
 * Deliberately a self-contained string with NO interpolated request data — a
 * middleware error page is the last place to introduce a reflected-XSS sink.
 *
 * Colours are CSS **system colours** rather than design tokens. Middleware
 * returns this as a standalone document with no stylesheet, so a semantic
 * custom property would resolve to nothing and render invisible text; raw hex
 * in a `.ts` file under `apps/web/src` would fail `guard:design-tokens`.
 * `Canvas`/`CanvasText` need neither, and honour the reader's light/dark
 * preference for free.
 */
const RATE_LIMITED_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Too many requests</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:Canvas; color:CanvasText;
         font-family:system-ui,-apple-system,"Segoe UI",sans-serif; line-height:1.5; }
  main { max-width:32rem; padding:2rem; text-align:center; }
  h1 { font-size:1.5rem; margin:0 0 .5rem; }
  p { margin:0 0 1.5rem; }
</style></head>
<body><main>
  <h1>Too many requests</h1>
  <p>You&rsquo;ve made a lot of requests in a short time. Please wait a moment and try again.</p>
  <p><a href="/dashboard">Back to your dashboard</a></p>
</main></body></html>`;

/**
 * Build a 429 Too Many Requests response.
 *
 * Content-negotiated: browsers navigating to a page get HTML, everything else
 * gets the JSON envelope. Before this, a throttled navigation rendered a raw
 * `{"error":{"code":"rate_limited"}}` blob in the address bar.
 */
export function rateLimitedResponse(
  result: RateLimitCheckResult,
  requestId: string,
  request?: NextRequest,
): Response {
  const headers: Record<string, string> = {
    'Retry-After': String(result.retryAfter),
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': '0',
    'X-Request-ID': requestId,
  };

  if (wantsHtml(request)) {
    return new Response(RATE_LIMITED_HTML, {
      status: 429,
      headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return new Response(
    JSON.stringify({
      error: {
        code: 'rate_limited',
        message: 'Too many requests',
        retryAfter: result.retryAfter,
      },
    }),
    {
      status: 429,
      headers: { ...headers, 'Content-Type': 'application/json' },
    },
  );
}

/**
 * True for a top-level browser navigation.
 *
 * Checks `Sec-Fetch-Mode: navigate` first — it is unambiguous and unspoofable
 * by page script. Falls back to an `Accept` sniff for clients that omit it,
 * requiring `text/html` to outrank `application/json` so an XHR sending
 * `Accept: * / *` still receives JSON.
 */
function wantsHtml(request?: NextRequest): boolean {
  if (!request) return false;
  if (request.headers.get('sec-fetch-mode') === 'navigate') return true;

  const accept = request.headers.get('accept') ?? '';
  if (!accept.includes('text/html')) return false;
  return !accept.includes('application/json');
}
