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

// ---------------------------------------------------------------------------
// Simple sliding-window rate limiter (edge-compatible, in-memory)
//
// NOTE: This in-memory store resets on each serverless cold start, so rate
// limiting is best-effort in Vercel's ephemeral environment. This matches the
// same pattern used in apps/web (see apps/web/src/lib/middleware/rate-limiter.ts).
// For production hardening, swap to a centralized store (e.g. Upstash Redis).
// ---------------------------------------------------------------------------

interface RateBucket {
  count: number;
  windowStart: number;
}

const RATE_STORE = new Map<string, RateBucket>();
const RATE_LIMIT = 100;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): { allowed: boolean } {
  const now = Date.now();
  const bucket = RATE_STORE.get(ip);

  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    RATE_STORE.set(ip, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= RATE_LIMIT) {
    return { allowed: false };
  }

  bucket.count++;
  return { allowed: true };
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
const SPOOFED_HEADERS = [
  'x-community-id',
  'x-tenant-slug',
  'x-user-id',
  'x-tenant-source',
] as const;

// Routes that bypass admin auth check
const PUBLIC_PATH_PREFIXES = ['/auth/', '/api/health'];
const PUBLIC_EXACT_PATHS = ['/auth/login', '/dev/agent-login'];

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_EXACT_PATHS.includes(pathname) ||
    PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p))
  );
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest) {
  maybeEvict();

  const pathname = request.nextUrl.pathname;

  // 1. Strip spoofed headers — clone the request with clean headers
  const cleanHeaders = new Headers(request.headers);
  for (const header of SPOOFED_HEADERS) {
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
  const { supabase, response } = await createMiddlewareClient(modifiedRequest, ADMIN_COOKIE_OPTIONS);
  response.headers.set('x-request-id', requestId);

  // 4. Allow public paths through immediately (no admin check)
  if (isPublicPath(pathname)) {
    return response;
  }

  // 5. Rate-limit API routes
  if (isApiRoute(pathname)) {
    const ip =
      (request as NextRequest & { ip?: string }).ip ??
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      'unknown';
    const rl = checkRateLimit(ip);
    if (!rl.allowed) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': String(RATE_LIMIT),
          'X-RateLimit-Remaining': '0',
        },
      });
    }
  }

  // 6. Verify Supabase user (server-side JWT revalidation)
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  // Forward verified user ID for route handlers
  response.headers.set('x-user-id', user.id);

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
