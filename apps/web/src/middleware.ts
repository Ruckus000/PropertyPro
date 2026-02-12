/**
 * Next.js middleware — runs on every matched request.
 *
 * Responsibilities:
 * 1. Refresh Supabase auth session without blocking rendering
 * 2. Redirect unauthenticated users away from protected routes to /auth/login?returnTo=<original>
 * 3. Redirect authenticated but unverified users to /auth/verify-email
 * 4. Attach X-Request-ID (UUID) header for request tracing [AGENTS #45]
 */
import { type NextRequest, NextResponse } from 'next/server';
import { createMiddlewareClient } from '@propertypro/db/supabase/middleware';

/**
 * Routes under (authenticated) that require a valid session.
 * The Next.js route group `(authenticated)` is stripped from the URL,
 * so we match on the actual URL paths that live inside that group.
 */
const PROTECTED_PATH_PREFIXES = ['/dashboard', '/settings', '/documents', '/maintenance', '/api/v1'];
const API_PATH_PREFIX = '/api/v1';

/** Public auth routes that should never trigger a redirect loop. */
const AUTH_PATH_PREFIX = '/auth';
const VERIFY_EMAIL_PATH = '/auth/verify-email';

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith(API_PATH_PREFIX);
}

function buildReturnTo(request: NextRequest): string {
  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

function attachResponseCookies(source: NextResponse, target: NextResponse): void {
  for (const { name, value, ...options } of source.cookies.getAll()) {
    target.cookies.set(name, value, options);
  }
}

function withTracingAndCookies(
  source: NextResponse,
  target: NextResponse,
  requestId: string,
): NextResponse {
  attachResponseCookies(source, target);
  target.headers.set('X-Request-ID', requestId);
  return target;
}

/**
 * NOTE: pnpm may resolve separate `next` virtual packages for the web app
 * and the db package (due to differing optional peers from @sentry/nextjs).
 * The NextRequest/NextResponse types are structurally identical at runtime,
 * but TypeScript sees them as distinct nominal types because of private
 * symbols like [INTERNALS]. We cast through `unknown` at the boundary.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  // Refresh Supabase session (reads + writes cookies)
  const { supabase, response } = await createMiddlewareClient(
    request as unknown as Parameters<typeof createMiddlewareClient>[0],
  );
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();

  // AGENTS #45: Generate a UUID request ID for tracing
  response.headers.set('X-Request-ID', requestId);

  const { pathname } = request.nextUrl;

  // Only enforce auth checks on protected paths
  if (isProtectedPath(pathname)) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      if (isApiPath(pathname)) {
        return withTracingAndCookies(
          response as unknown as NextResponse,
          NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
          requestId,
        );
      }

      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/auth/login';
      loginUrl.searchParams.set('returnTo', buildReturnTo(request));
      return withTracingAndCookies(
        response as unknown as NextResponse,
        NextResponse.redirect(loginUrl),
        requestId,
      );
    }

    if (!user.email_confirmed_at && pathname !== VERIFY_EMAIL_PATH) {
      if (isApiPath(pathname)) {
        return withTracingAndCookies(
          response as unknown as NextResponse,
          NextResponse.json({ error: 'Email verification required' }, { status: 403 }),
          requestId,
        );
      }

      const verifyUrl = request.nextUrl.clone();
      verifyUrl.pathname = VERIFY_EMAIL_PATH;
      verifyUrl.searchParams.set('returnTo', buildReturnTo(request));
      return withTracingAndCookies(
        response as unknown as NextResponse,
        NextResponse.redirect(verifyUrl),
        requestId,
      );
    }
  }

  // Redirect already-authenticated users away from auth pages (except verify-email)
  if (pathname.startsWith(AUTH_PATH_PREFIX) && pathname !== VERIFY_EMAIL_PATH) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      if (!user.email_confirmed_at) {
        const verifyUrl = request.nextUrl.clone();
        verifyUrl.pathname = VERIFY_EMAIL_PATH;
        const returnTo = request.nextUrl.searchParams.get('returnTo');
        if (returnTo) {
          verifyUrl.searchParams.set('returnTo', returnTo);
        }
        return withTracingAndCookies(
          response as unknown as NextResponse,
          NextResponse.redirect(verifyUrl),
          requestId,
        );
      }

      const returnTo = request.nextUrl.searchParams.get('returnTo');
      const destination = request.nextUrl.clone();
      destination.pathname = returnTo || '/dashboard';
      destination.searchParams.delete('returnTo');
      return withTracingAndCookies(
        response as unknown as NextResponse,
        NextResponse.redirect(destination),
        requestId,
      );
    }
  }

  return response as unknown as NextResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon)
     * - Public assets (svg, png, jpg, jpeg, gif, webp, ico)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
