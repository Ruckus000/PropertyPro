/**
 * Next.js middleware for apps/admin — runs on every matched request.
 *
 * Responsibilities (in order):
 * 1. Strip spoofed tenant/user headers from incoming requests
 * 2. Refresh Supabase auth session
 * 3. Rate-limit API routes (100 req/min per IP)
 * 4. Allow /auth/login and /api/health without admin check
 * 5. Require valid platform_admin_users row for all other routes
 * 6. Redirect to /auth/login on 401/403
 * 7. Attach X-Request-ID for request tracing
 */
import { NextRequest, NextResponse } from 'next/server';
import { createMiddlewareClient } from '@propertypro/db/supabase/middleware';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { ADMIN_COOKIE_OPTIONS } from '@/lib/auth/cookie-config';
import { applySecurityHeaders } from '@/lib/middleware/security-headers';
import {
  ADMIN_FORWARDED_HEADERS,
  ADMIN_ROLE_HEADER,
  ADMIN_USER_EMAIL_HEADER,
  ADMIN_USER_ID_HEADER,
  normalizeAdminHeaderValue,
} from '@/lib/request/forwarded-headers';

// ---------------------------------------------------------------------------
// Fixed-window rate limiter (edge-compatible, in-memory)
//
// ## What this does and does not cover
//
// Two buckets. `/auth/*` and `/dev/agent-login` get a tight one; everything
// else gets the general API allowance. Both are keyed on client IP.
//
// **It cannot throttle admin sign-in.** `app/auth/login/page.tsx` calls
// `supabase.auth.signInWithPassword` from a BROWSER client, so the credential
// attempt goes straight to Supabase GoTrue and never reaches this middleware.
// GoTrue's own per-IP limits are the real control there. What the auth bucket
// below does buy is a cap on hammering the login PAGE and `/dev/agent-login`.
// Throttling credentials app-side needs a server-side sign-in route — tracked
// separately, deliberately not folded into a hardening pass.
//
// **It is per-instance and resets on cold start.** Vercel runs many concurrent
// instances, each with its own Map, so the effective limit is (limit ×
// instances) and a burst that lands on fresh instances is not counted at all.
// This is best-effort by design; a real limit needs a centralized store
// (Upstash Redis — `UPSTASH_REDIS_REST_URL` is already reserved in
// .env.example). apps/web has the same property.
// ---------------------------------------------------------------------------

interface RateBucket {
  count: number;
  windowStart: number;
}

const RATE_STORE = new Map<string, RateBucket>();
const RATE_WINDOW_MS = 60_000;

/**
 * Hard ceiling on distinct keys held at once.
 *
 * `maybeEvict()` only runs every 5 minutes and only drops entries older than
 * two windows, so between sweeps nothing bounded the Map at all — a client
 * varying its forwarded IP inserted one entry per request for up to five
 * minutes. Widening the limiter to cover the auth surface increased the key
 * volume, so the ceiling matters more than it did.
 *
 * At the cap the store is cleared outright rather than LRU-evicted: this is a
 * best-effort limiter (see the note above), and a full reset is the same
 * failure mode as a cold start, which it already tolerates by design.
 */
const RATE_STORE_MAX_KEYS = 10_000;

/** General allowance, per IP per minute. */
const RATE_LIMIT = 100;

/**
 * Auth-surface allowance, per IP per minute. Much tighter: a human signing in
 * loads the page a handful of times, so anything above this is automation.
 */
const AUTH_RATE_LIMIT = 20;

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Unix seconds when the current window expires. */
  resetAt: number;
}

function checkRateLimit(key: string, limit: number): RateLimitResult {
  const now = Date.now();
  const bucket = RATE_STORE.get(key);

  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    if (!bucket && RATE_STORE.size >= RATE_STORE_MAX_KEYS) {
      RATE_STORE.clear();
    }
    RATE_STORE.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      resetAt: Math.ceil((now + RATE_WINDOW_MS) / 1000),
    };
  }

  const resetAt = Math.ceil((bucket.windowStart + RATE_WINDOW_MS) / 1000);

  if (bucket.count >= limit) {
    return { allowed: false, limit, remaining: 0, resetAt };
  }

  bucket.count++;
  return { allowed: true, limit, remaining: limit - bucket.count, resetAt };
}

/**
 * Client IP for rate-limit keying.
 *
 * Returns `null` rather than the string 'unknown' when no IP can be
 * determined. A shared 'unknown' key put every such client into ONE bucket, so
 * a single unattributable request stream could exhaust the allowance for all of
 * them — a self-inflicted denial of service. Unkeyable requests are simply not
 * counted; that is the safer failure direction for a console whose real gate is
 * the platform_admin_users check below.
 */
function resolveClientIp(request: NextRequest): string | null {
  // `NextRequest.ip` was removed in Next 15 — reading it here was dead code
  // inherited from the original implementation, which made `x-forwarded-for`
  // the real source while looking like a fallback.
  //
  // Only `x-forwarded-for` is consulted. Vercel overwrites it at the edge with
  // the true client address, so on the deployed console it is trustworthy and
  // the first entry is the client. `x-real-ip` was also read before; it is
  // redundant there and strictly more forgeable anywhere else, so it is gone
  // rather than left as a second way in.
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || null;
}

/** The auth surface, which is public and therefore reachable unauthenticated. */
function isAuthSurface(pathname: string): boolean {
  return pathname.startsWith('/auth/') || pathname === '/dev/agent-login';
}

// Evict old entries to avoid unbounded memory growth
let lastEviction = Date.now();
function maybeEvict() {
  const now = Date.now();
  if (now - lastEviction < 5 * 60_000) return;
  lastEviction = now;
  for (const [key, bucket] of RATE_STORE) {
    if (now - bucket.windowStart > RATE_WINDOW_MS * 2) {
      RATE_STORE.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Header constants — strip inbound spoofed headers
// ---------------------------------------------------------------------------
// Routes that bypass admin auth check.
//
// `/api/health` is an EXACT path, not a prefix. As a prefix it would silently
// make any future `/api/healthz` or `/api/health-internal` route
// unauthenticated on a console that holds the service-role key.
const PUBLIC_PATH_PREFIXES = ['/auth/'];
// `/icon.svg` is the App Router favicon. Without it here every request for
// the tab icon 307s to the login page — so the LOGIN page, the one screen
// guaranteed to be unauthenticated, has no favicon — and every
// authenticated request for it costs a platform_admin_users lookup.
const PUBLIC_EXACT_PATHS = ['/auth/login', '/dev/agent-login', '/api/health', '/icon.svg'];

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_EXACT_PATHS.includes(pathname) ||
    PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p))
  );
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

function attachResponseCookies(source: NextResponse, target: NextResponse): void {
  if (typeof source.cookies?.getAll !== 'function') {
    return;
  }
  for (const { name, value, ...options } of source.cookies.getAll()) {
    target.cookies.set(name, value, options);
  }
}

function buildForwardedResponse(
  source: NextResponse,
  requestHeaders: Headers,
  requestId: string,
): NextResponse {
  const target = NextResponse.next({
    request: { headers: requestHeaders },
  });
  attachResponseCookies(source, target);
  target.headers.set('x-request-id', requestId);
  return target;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * The middleware proper. Every `return` here flows through the
 * `applySecurityHeaders` wrapper in the exported `middleware` below — do NOT
 * add security headers to individual returns.
 *
 * This split exists deliberately. The handler has five exit points (public
 * path, rate-limit 429, two auth redirects, and the authorized response), and
 * stamping headers at each of them is the shape where one gets missed and the
 * console silently serves an unprotected response.
 */
async function handleRequest(request: NextRequest): Promise<Response> {
  maybeEvict();

  const pathname = request.nextUrl.pathname;

  // 1. Strip spoofed headers — clone the request with clean headers
  const cleanHeaders = new Headers(request.headers);
  for (const header of ADMIN_FORWARDED_HEADERS) {
    cleanHeaders.delete(header);
  }

  // 2. Attach X-Request-ID
  const requestId = crypto.randomUUID();
  cleanHeaders.set('x-request-id', requestId);

  // Build a modified NextRequest with clean headers for downstream
  const modifiedRequest = new NextRequest(request.url, {
    method: request.method,
    headers: cleanHeaders,
    body: request.body,
  });

  // 3. Refresh Supabase session
  const {
    response,
    user: middlewareUser,
  } = await createMiddlewareClient(modifiedRequest, ADMIN_COOKIE_OPTIONS);

  // 4. Rate-limit BEFORE the public-path short-circuit.
  //
  // This used to sit after it, and was additionally gated on `isApiRoute`, so
  // the only throttled surface was `/api/admin/*` — endpoints that already
  // require a platform_admin_users row. Every unauthenticated surface, which is
  // the part an attacker can actually reach, was exempt twice over.
  const authSurface = isAuthSurface(pathname);
  if (authSurface || isApiRoute(pathname)) {
    const ip = resolveClientIp(request);
    if (ip) {
      const limit = authSurface ? AUTH_RATE_LIMIT : RATE_LIMIT;
      // Separate keyspaces: a burst of API calls must not consume the login
      // allowance, and vice versa.
      const rl = checkRateLimit(`${authSurface ? 'auth' : 'api'}:${ip}`, limit);
      if (!rl.allowed) {
        return new NextResponse('Too Many Requests', {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(1, rl.resetAt - Math.ceil(Date.now() / 1000))),
            'X-RateLimit-Limit': String(rl.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(rl.resetAt),
          },
        });
      }
    }
  }

  // 5. Allow public paths through (no admin check)
  if (isPublicPath(pathname)) {
    return buildForwardedResponse(response, cleanHeaders, requestId);
  }

  // 6. Verify Supabase user (JWT verified in createMiddlewareClient)
  const user = middlewareUser;

  if (!user) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 7. Verify platform_admin_users row (service role query)
  const adminDb = createAdminClient();
  const { data: adminRow } = await adminDb
    .from('platform_admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();

  if (!adminRow) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('error', 'access_denied');
    return NextResponse.redirect(loginUrl);
  }

  cleanHeaders.set(ADMIN_USER_ID_HEADER, user.id);
  const email = normalizeAdminHeaderValue(user.email);
  if (email) {
    cleanHeaders.set(ADMIN_USER_EMAIL_HEADER, email);
  }
  cleanHeaders.set(ADMIN_ROLE_HEADER, 'super_admin');

  return buildForwardedResponse(response, cleanHeaders, requestId);
}

/**
 * Middleware entry point.
 *
 * The only job here is to guarantee that EVERY response leaving the admin app
 * — including error paths, redirects and the 429 — carries the security header
 * set. Keeping this as a wrapper rather than N call sites is what makes that
 * structurally true instead of a convention someone has to remember.
 */
export async function middleware(request: NextRequest): Promise<Response> {
  const isApi = isApiRoute(request.nextUrl.pathname);

  let response: Response;
  try {
    response = await handleRequest(request);
  } catch {
    // handleRequest CAN throw — createAdminClient() throws on a missing
    // SUPABASE_SERVICE_ROLE_KEY, createMiddlewareClient can throw on a
    // malformed cookie, and reconstructing the NextRequest can throw on a
    // stream body. Without this, Next's built-in middleware-error response is
    // returned with no CSP and no X-Frame-Options — the one exit path the
    // "every response" guarantee above would otherwise still miss.
    //
    // Deliberately opaque: the reason is already going to Sentry via the app's
    // instrumentation, and this is the unauthenticated edge.
    response = new NextResponse('Internal Server Error', { status: 500 });
  }

  return applySecurityHeaders(response, { isApi }) as Response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
