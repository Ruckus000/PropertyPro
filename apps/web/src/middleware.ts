/**
 * Next.js middleware — runs on every matched request.
 *
 * Responsibilities:
 * 1. Refresh Supabase auth session without blocking rendering
 * 2. Resolve tenant context for protected routes and return 404 on invalid tenants
 * 3. Redirect unauthenticated users away from protected routes to /auth/login?returnTo=<original>
 * 4. Redirect authenticated but unverified users to /auth/verify-email
 * 5. Attach X-Request-ID (UUID) header for request tracing [AGENTS #45]
 * 6. Forward server-controlled tenant/user headers and strip spoofed inbound values
 * 7. Rate limit API requests to prevent abuse [P2-42]
 * 8. Apply CORS validation and security response headers [P4-56]
 */
import { type NextRequest, NextResponse } from 'next/server';
import { createMiddlewareClient } from '@propertypro/db/supabase/middleware';
import { resolveCommunityContext } from '@propertypro/shared';
import {
  checkRateLimit,
  rateLimitedResponse,
  classifyRoute,
} from './lib/middleware/rate-limit-config';
import {
  isAllowedOrigin,
  buildCorsHeaders,
  buildSecurityHeaders,
  buildCspHeader,
} from './lib/middleware/security-headers';

/**
 * Routes under (authenticated) that require a valid session.
 * The Next.js route group `(authenticated)` is stripped from the URL,
 * so we match on the actual URL paths that live inside that group.
 *
 * No prefix should be a substring-prefix of another (e.g. adding '/con'
 * would incorrectly match '/contracts' and '/communities').
 */
const PROTECTED_PATH_PREFIXES = [
  '/dashboard',
  '/select-community',
  '/settings',
  '/documents',
  '/maintenance',
  '/contracts',
  '/audit-trail',
  '/announcements',
  '/mobile',
  '/pm',
  '/communities',
  '/onboarding',
  '/api/v1',
];
const API_PATH_PREFIX = '/api/v1';
const TOKEN_AUTH_ROUTES: ReadonlyArray<{ path: string; method: string }> = [
  { path: '/api/v1/invitations', method: 'PATCH' },
  { path: '/api/v1/auth/signup', method: 'GET' },
  { path: '/api/v1/auth/signup', method: 'POST' },
  { path: '/api/v1/internal/notification-digests/process', method: 'POST' },
  // Stripe webhook: signature-verified by handler, no session required [P2-34]
  { path: '/api/v1/webhooks/stripe', method: 'POST' },
  // Payment reminders cron: Bearer-token-authenticated, called by Vercel Cron [P2-34a]
  { path: '/api/v1/internal/payment-reminders', method: 'POST' },
  // Demo auto-auth: HMAC-token-validated, no session required [Task 2.4-2.6]
  { path: '/api/v1/auth/demo-login', method: 'GET' },
];

/** Public auth routes that should never trigger a redirect loop. */
const AUTH_PATH_PREFIX = '/auth';
const VERIFY_EMAIL_PATH = '/auth/verify-email';

const COMMUNITY_ID_HEADER = 'x-community-id';
const TENANT_SLUG_HEADER = 'x-tenant-slug';
const TENANT_SOURCE_HEADER = 'x-tenant-source';
const USER_ID_HEADER = 'x-user-id';

const TENANT_CACHE_MAX_ENTRIES = 256;
const TENANT_CACHE_TTL_MS = 5 * 60 * 1000;
const TENANT_NEGATIVE_CACHE_TTL_MS = 30 * 1000;

type TenantCacheEntry = {
  communityId: number | null;
  expiresAt: number;
};

const tenantCache = new Map<string, TenantCacheEntry>();

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function shouldResolveTenant(pathname: string): boolean {
  return isProtectedPath(pathname);
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith(API_PATH_PREFIX);
}

function isTokenAuthenticatedApiRoute(request: NextRequest): boolean {
  return TOKEN_AUTH_ROUTES.some(
    (route) =>
      request.nextUrl.pathname === route.path &&
      request.method.toUpperCase() === route.method,
  );
}

function buildReturnTo(request: NextRequest): string {
  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

function attachResponseCookies(source: NextResponse, target: NextResponse): void {
  for (const { name, value, ...options } of source.cookies.getAll()) {
    target.cookies.set(name, value, options);
  }
}

/**
 * Finalise a response: copy cookies from the Supabase session response,
 * stamp X-Request-ID, and apply security/CORS headers. [P4-56]
 */
function finaliseResponse(
  source: NextResponse,
  target: NextResponse,
  requestId: string,
  origin: string | null,
  isApi: boolean,
  isPreview: boolean = false,
): NextResponse {
  attachResponseCookies(source, target);
  target.headers.set('X-Request-ID', requestId);

  // CORS headers — only set when origin is in the allowlist
  const corsHeaders = buildCorsHeaders(origin);
  for (const [name, value] of Object.entries(corsHeaders)) {
    target.headers.set(name, value);
  }

  // Universal security headers (relaxed for admin preview iframes)
  const secHeaders = buildSecurityHeaders({ isPreview });
  for (const [name, value] of Object.entries(secHeaders)) {
    target.headers.set(name, value);
  }

  // CSP for page responses only (not JSON API responses)
  if (!isApi) {
    target.headers.set('Content-Security-Policy', buildCspHeader({ isPreview }));
  }

  return target;
}

function notFoundResponse(
  request: NextRequest,
  source: NextResponse,
  requestId: string,
  origin: string | null,
  isPreview: boolean = false,
): NextResponse {
  const isApi = isApiPath(request.nextUrl.pathname);
  const target = isApi
    ? NextResponse.json({ error: 'Not Found' }, { status: 404 })
    : new NextResponse('Not Found', { status: 404 });
  return finaliseResponse(source, target, requestId, origin, isApi, isPreview);
}

function internalErrorResponse(
  request: NextRequest,
  source: NextResponse,
  requestId: string,
  origin: string | null,
  isPreview: boolean = false,
): NextResponse {
  const isApi = isApiPath(request.nextUrl.pathname);
  const target = isApi
    ? NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    : new NextResponse('Internal Server Error', { status: 500 });
  return finaliseResponse(source, target, requestId, origin, isApi, isPreview);
}

function readTenantCache(slug: string): number | null | undefined {
  const entry = tenantCache.get(slug);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    tenantCache.delete(slug);
    return undefined;
  }
  return entry.communityId;
}

function writeTenantCache(slug: string, communityId: number | null): void {
  if (tenantCache.size >= TENANT_CACHE_MAX_ENTRIES) {
    const oldestKey = tenantCache.keys().next().value;
    if (oldestKey) {
      tenantCache.delete(oldestKey);
    }
  }

  tenantCache.set(slug, {
    communityId,
    expiresAt:
      Date.now() +
      (communityId == null ? TENANT_NEGATIVE_CACHE_TTL_MS : TENANT_CACHE_TTL_MS),
  });
}

async function findCommunityIdBySlug(
  supabase: Awaited<ReturnType<typeof createMiddlewareClient>>['supabase'],
  slug: string,
): Promise<number | null> {
  const cached = readTenantCache(slug);
  if (cached !== undefined) {
    return cached;
  }

  const { data, error } = await supabase
    .from('communities')
    .select('id')
    .eq('slug', slug)
    .is('deleted_at', null)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const communityId =
    typeof data?.[0]?.id === 'number' && Number.isInteger(data[0].id)
      ? data[0].id
      : null;

  writeTenantCache(slug, communityId);
  return communityId;
}

function sanitizeForwardedHeaders(request: NextRequest, requestId: string): Headers {
  const headers = new Headers(request.headers);
  headers.delete(COMMUNITY_ID_HEADER);
  headers.delete(TENANT_SLUG_HEADER);
  headers.delete(TENANT_SOURCE_HEADER);
  headers.delete(USER_ID_HEADER);
  headers.set('x-request-id', requestId);
  return headers;
}

/**
 * NOTE: pnpm may resolve separate `next` virtual packages for the web app
 * and the db package (due to differing optional peers from @sentry/nextjs).
 * The NextRequest/NextResponse types are structurally identical at runtime,
 * but TypeScript sees them as distinct nominal types because of private
 * symbols like [INTERNALS]. We cast through `unknown` at the boundary.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get('origin');
  const isApi = isApiPath(pathname);
  const isPreviewRequest = request.nextUrl.searchParams.get('preview') === 'true';

  // --- CORS preflight — handle before heavier processing [P4-56] ---
  // OPTIONS requests from browsers trigger preflight checks. Allowed origins
  // receive CORS headers; all others receive 403 so browsers block the request.
  if (request.method === 'OPTIONS' && isApi) {
    if (origin && isAllowedOrigin(origin)) {
      const preflightHeaders = buildCorsHeaders(origin);
      const preflightResponse = new NextResponse(null, { status: 204 });
      for (const [name, value] of Object.entries(preflightHeaders)) {
        preflightResponse.headers.set(name, value);
      }
      return preflightResponse;
    }
    return new NextResponse(null, { status: 403 });
  }

  // Refresh Supabase session (reads + writes cookies)
  const { supabase, response } = await createMiddlewareClient(
    request as unknown as Parameters<typeof createMiddlewareClient>[0],
  );
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const forwardedHeaders = sanitizeForwardedHeaders(request, requestId);

  // --- Rate limiting (Phase 1: unauthenticated routes) [P2-42] ---
  // For auth and public routes, check rate limit by IP before doing heavier work.
  const routeCategory = classifyRoute(pathname, request.method);
  if (routeCategory === 'auth' || routeCategory === 'public') {
    const rateLimitResult = checkRateLimit(request, null);
    if (rateLimitResult && !rateLimitResult.allowed) {
      console.warn(
        `[rate-limit] 429 for ${routeCategory} route ${pathname} from IP (key omitted)`,
      );
      return rateLimitedResponse(rateLimitResult, requestId) as unknown as NextResponse;
    }
  }

  // Tenant resolution for protected routes occurs before auth checks.
  // This prevents exposing auth state on invalid tenant requests.
  if (shouldResolveTenant(pathname)) {
    const tenantContext = resolveCommunityContext({
      searchParams: request.nextUrl.searchParams,
      host: request.headers.get('host'),
    });

    if (tenantContext.isReservedSubdomain) {
      return notFoundResponse(request, response as unknown as NextResponse, requestId, origin, isPreviewRequest);
    }

    // Forward community ID from query param so layouts can read it from headers
    if (tenantContext.communityId) {
      forwardedHeaders.set(COMMUNITY_ID_HEADER, String(tenantContext.communityId));
      forwardedHeaders.set(TENANT_SOURCE_HEADER, tenantContext.source);
    }

    if (tenantContext.tenantSlug) {
      try {
        const communityId = await findCommunityIdBySlug(supabase, tenantContext.tenantSlug);
        if (communityId == null) {
          return notFoundResponse(request, response as unknown as NextResponse, requestId, origin, isPreviewRequest);
        }
        forwardedHeaders.set(COMMUNITY_ID_HEADER, String(communityId));
        forwardedHeaders.set(TENANT_SLUG_HEADER, tenantContext.tenantSlug);
        forwardedHeaders.set(TENANT_SOURCE_HEADER, tenantContext.source);
      } catch {
        return internalErrorResponse(request, response as unknown as NextResponse, requestId, origin, isPreviewRequest);
      }
    }
  }

  // Only enforce auth checks on protected paths
  if (isProtectedPath(pathname)) {
    const isTokenAuthRoute = isTokenAuthenticatedApiRoute(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      forwardedHeaders.set(USER_ID_HEADER, user.id);
    }

    // --- Rate limiting (Phase 2: authenticated API routes) [P2-42] ---
    // For read/write API routes, check rate limit by user ID (or IP fallback).
    if (
      isApiPath(pathname) &&
      (routeCategory === 'read' || routeCategory === 'write')
    ) {
      const rateLimitResult = checkRateLimit(request, user?.id ?? null);
      if (rateLimitResult && !rateLimitResult.allowed) {
        console.warn(
          `[rate-limit] 429 for ${routeCategory} route ${pathname} (user: ${user?.id ?? 'anonymous'})`,
        );
        return rateLimitedResponse(rateLimitResult, requestId) as unknown as NextResponse;
      }
    }

    if (!user && !isTokenAuthRoute) {
      if (isApiPath(pathname)) {
        return finaliseResponse(
          response as unknown as NextResponse,
          NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
          requestId,
          origin,
          isApi,
          isPreviewRequest,
        );
      }

      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/auth/login';
      loginUrl.searchParams.set('returnTo', buildReturnTo(request));
      return finaliseResponse(
        response as unknown as NextResponse,
        NextResponse.redirect(loginUrl),
        requestId,
        origin,
        isApi,
        isPreviewRequest,
      );
    }

    if (user && !isTokenAuthRoute && !user.email_confirmed_at && pathname !== VERIFY_EMAIL_PATH) {
      if (isApiPath(pathname)) {
        return finaliseResponse(
          response as unknown as NextResponse,
          NextResponse.json({ error: 'Email verification required' }, { status: 403 }),
          requestId,
          origin,
          isApi,
          isPreviewRequest,
        );
      }

      const verifyUrl = request.nextUrl.clone();
      verifyUrl.pathname = VERIFY_EMAIL_PATH;
      verifyUrl.searchParams.set('returnTo', buildReturnTo(request));
      return finaliseResponse(
        response as unknown as NextResponse,
        NextResponse.redirect(verifyUrl),
        requestId,
        origin,
        isApi,
        isPreviewRequest,
      );
    }
  }

  // --- Public site auth-split [Wave 5 / Task 3.3] ---
  // When a community subdomain requests '/' (the public site root):
  //   - Resolve tenant context and forward headers so the page can read community info
  //   - If authenticated, redirect to /dashboard (existing logged-in experience)
  //   - If NOT authenticated, let through to the public site renderer
  if (pathname === '/') {
    const tenantContext = resolveCommunityContext({
      searchParams: request.nextUrl.searchParams,
      host: request.headers.get('host'),
    });

    const hasCommunityContext =
      tenantContext.source !== 'none' && !tenantContext.isReservedSubdomain;

    if (hasCommunityContext) {
      // Resolve community ID from slug if needed
      if (tenantContext.communityId) {
        forwardedHeaders.set(COMMUNITY_ID_HEADER, String(tenantContext.communityId));
        forwardedHeaders.set(TENANT_SOURCE_HEADER, tenantContext.source);
      } else if (tenantContext.tenantSlug) {
        try {
          const communityId = await findCommunityIdBySlug(supabase, tenantContext.tenantSlug);
          if (communityId != null) {
            forwardedHeaders.set(COMMUNITY_ID_HEADER, String(communityId));
            forwardedHeaders.set(TENANT_SLUG_HEADER, tenantContext.tenantSlug);
            forwardedHeaders.set(TENANT_SOURCE_HEADER, tenantContext.source);
          }
        } catch {
          // Non-fatal for public site — continue without community headers
        }
      }

      // Check auth: authenticated users go to dashboard, unauthenticated see public site
      const {
        data: { user: publicSiteUser },
      } = await supabase.auth.getUser();

      if (publicSiteUser && !isPreviewRequest) {
        const dashboardUrl = request.nextUrl.clone();
        dashboardUrl.pathname = '/dashboard';
        return finaliseResponse(
          response as unknown as NextResponse,
          NextResponse.redirect(dashboardUrl),
          requestId,
          origin,
          isApi,
          isPreviewRequest,
        );
      }

      // Unauthenticated — rewrite to /_site so the public-site page renders
      const siteUrl = request.nextUrl.clone();
      siteUrl.pathname = '/_site';
      const publicSiteResponse = NextResponse.rewrite(siteUrl, {
        request: { headers: forwardedHeaders },
      });
      return finaliseResponse(
        response as unknown as NextResponse,
        publicSiteResponse,
        requestId,
        origin,
        isApi,
        isPreviewRequest,
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
        return finaliseResponse(
          response as unknown as NextResponse,
          NextResponse.redirect(verifyUrl),
          requestId,
          origin,
          isApi,
          isPreviewRequest,
        );
      }

      const returnTo = request.nextUrl.searchParams.get('returnTo');
      const destination = request.nextUrl.clone();
      destination.pathname = returnTo || '/dashboard';
      destination.searchParams.delete('returnTo');
      return finaliseResponse(
        response as unknown as NextResponse,
        NextResponse.redirect(destination),
        requestId,
        origin,
        isApi,
        isPreviewRequest,
      );
    }
  }

  const nextResponse = NextResponse.next({
    request: {
      headers: forwardedHeaders,
    },
  });
  return finaliseResponse(
    response as unknown as NextResponse,
    nextResponse,
    requestId,
    origin,
    isApi,
    isPreviewRequest,
  );
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
