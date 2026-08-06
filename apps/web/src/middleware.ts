/**
 * Next.js middleware — runs on every matched request.
 *
 * Responsibilities:
 * 1. Refresh Supabase auth session without blocking rendering
 * 2. Resolve tenant context for protected routes; unknown tenant slugs on pages
 *    redirect to canonical /select-community (APIs return 404 JSON)
 * 3. Redirect unauthenticated users away from protected routes to /auth/login?returnTo=<original>
 * 4. Redirect authenticated but unverified users to /auth/verify-email
 * 5. Attach X-Request-ID (UUID) header for request tracing [AGENTS #45]
 * 6. Forward server-controlled tenant/user headers and strip spoofed inbound values
 * 7. Rate limit API requests to prevent abuse [P2-42]
 * 8. Apply CORS validation and security response headers [P4-56]
 */
import { type NextRequest, NextResponse } from 'next/server';
import { captureMessage } from '@sentry/nextjs';
import { createMiddlewareClient } from '@propertypro/db/supabase/middleware';
import {
  getWebAppOriginFromEnv,
  resolveCommunityContext,
  SUPPORT_SESSION_COOKIE,
} from '@propertypro/shared';
import {
  buildSupportSessionClearCookie,
  resolveSupportCookieHostname,
} from '@propertypro/shared/http';
import { UNKNOWN_SUBDOMAIN_REASON } from './lib/middleware/unknown-subdomain-reason';
import {
  resolveActiveSupportSession,
  isReadOnlyBlocked,
} from './lib/support/impersonation';
import {
  checkRateLimit,
  rateLimitedResponse,
  classifyRoute,
} from './lib/middleware/rate-limit-config';
import {
  isAllowedOrigin,
  isAllowedReferer,
  buildCorsHeaders,
  buildSecurityHeaders,
  buildCspHeader,
} from './lib/middleware/security-headers';
import {
  COMMUNITY_ID_HEADER,
  FORWARDED_AUTH_HEADERS,
  normalizeForwardedHeaderValue,
  SUPPORT_ADMIN_ID_HEADER,
  SUPPORT_SESSION_HEADER,
  SUPPORT_SESSION_ID_HEADER,
  TENANT_SLUG_HEADER,
  TENANT_SOURCE_HEADER,
  USER_EMAIL_HEADER,
  USER_FULL_NAME_HEADER,
  USER_ID_HEADER,
  USER_PHONE_HEADER,
} from './lib/request/forwarded-headers';
import { buildCommunityUrl } from './lib/utils/community-url';
import {
  classifySubdomainPath,
  HOST_NATIVE_PUBLIC_SUFFIX_ROUTES,
  isApexHost,
  isPublicSitePath,
  METADATA_FIRST_SEGMENTS,
  parsePathBasedPublicRoute,
  PROTECTED_PATH_PREFIXES,
  shouldRewriteHostTransparency,
} from './lib/middleware/public-host-routes';

const API_PATH_PREFIX = '/api/v1';
const TOKEN_AUTH_ROUTES: ReadonlyArray<{ path: string; method: string }> = [
  { path: '/api/v1/invitations', method: 'PATCH' },
  { path: '/api/v1/auth/signup', method: 'GET' },
  { path: '/api/v1/auth/signup', method: 'POST' },
  { path: '/api/v1/internal/notification-digests/process', method: 'POST' },
  { path: '/api/v1/internal/calendar-event-reminders', method: 'POST' },
  // Snowbird digest cron: Bearer-token-authenticated, called by the scheduled job
  { path: '/api/v1/internal/snowbird-digest', method: 'POST' },
  // Snowbird digest one-click unsubscribe: HMAC-token-authenticated, no session (CAN-SPAM)
  { path: '/api/v1/snowbird-digest/unsubscribe', method: 'GET' },
  // Insurance alerts cron: Bearer-token-authenticated, called by the scheduled job
  { path: '/api/v1/internal/insurance-alerts', method: 'POST' },
  // Insurance alerts unsubscribe: HMAC-token-authenticated, no session (CAN-SPAM);
  // GET backs the human-clicked link, POST is the RFC 8058 one-click target.
  { path: '/api/v1/insurance-alerts/unsubscribe', method: 'GET' },
  { path: '/api/v1/insurance-alerts/unsubscribe', method: 'POST' },
  // Stripe webhook: signature-verified by handler, no session required [P2-34]
  { path: '/api/v1/webhooks/stripe', method: 'POST' },
  // Payment reminders cron: Bearer-token-authenticated, called by Vercel Cron [P2-34a]
  { path: '/api/v1/internal/payment-reminders', method: 'POST' },
  // Provisioning watchdog: recovers paid signups whose provisioning stayed non-terminal
  { path: '/api/v1/internal/provisioning-watchdog', method: 'GET' },
  { path: '/api/v1/internal/provisioning-watchdog', method: 'POST' },
  // Assessment crons: Bearer-token-authenticated, called by Vercel Cron [Phase 1A]
  { path: '/api/v1/internal/assessment-overdue', method: 'POST' },
  { path: '/api/v1/internal/late-fee-processor', method: 'POST' },
  { path: '/api/v1/internal/generate-assessments', method: 'POST' },
  // Demo auto-auth: HMAC-token-validated, no session required [Task 2.4-2.6]
  { path: '/api/v1/auth/demo-login', method: 'GET' },
  // Public transparency page data endpoint (community opt-in gated)
  { path: '/api/v1/transparency', method: 'GET' },
  // Twilio SMS delivery webhook: HMAC-signature-verified by handler [Phase 1B]
  { path: '/api/v1/webhooks/twilio', method: 'POST' },
  // Signup email verification confirmation: no session yet, called from post-verify redirect [O-01]
  { path: '/api/v1/auth/confirm-verification', method: 'POST' },
  // Resend signup verification email: no session yet, called from /signup/verify page
  { path: '/api/v1/auth/resend-verification', method: 'POST' },
  // Provisioning status polling: no session yet, signupRequestId-authenticated [Provisioning Screen]
  { path: '/api/v1/auth/provisioning-status', method: 'GET' },
  { path: '/api/v1/internal/expire-demos', method: 'POST' },
  // Readiness check: Bearer-token-authenticated, deployment validation [Demo Conversion]
  { path: '/api/v1/internal/readiness', method: 'GET' },
  // Self-service resident signup: public submit + OTP verify (no session required)
  { path: '/api/v1/access-requests', method: 'POST' },
  { path: '/api/v1/access-requests/verify', method: 'POST' },
  // Public community discovery search (rate-limited, returns minimal metadata only)
  { path: '/api/v1/public/communities/search', method: 'GET' },
];

/** Public auth routes that should never trigger a redirect loop. */
const AUTH_PATH_PREFIX = '/auth';
const VERIFY_EMAIL_PATH = '/auth/verify-email';
const RESET_PASSWORD_PATH = '/auth/reset-password';

const TENANT_CACHE_MAX_ENTRIES = 256;
const TENANT_CACHE_TTL_MS = 5 * 60 * 1000;

type TenantCacheEntry = {
  communityId: number | null;
  expiresAt: number;
};

const tenantCache = new Map<string, TenantCacheEntry>();

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function shouldResolveTenant(pathname: string): boolean {
  // /select-community is a cross-tenant page that lists all communities the
  // user belongs to. It never reads x-community-id. Injecting tenant context
  // here would cause an infinite redirect loop when the authenticated layout
  // detects a wrong-community condition and redirects back here.
  if (pathname === '/select-community') return false;
  return isProtectedPath(pathname);
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith(API_PATH_PREFIX);
}

export function shouldHideDevSurfaceInProduction(
  pathname: string,
  nodeEnv: string | undefined = process.env.NODE_ENV,
  pdfjsTestEnabled: string | undefined = process.env.PDFJS_TEST_ENABLED,
): boolean {
  if (nodeEnv !== 'production') {
    return false;
  }

  if (pathname === '/pdfjs-test' || pathname.startsWith('/pdfjs-test/')) {
    return pdfjsTestEnabled !== '1';
  }

  return (
    pathname === '/dev/site-preview' ||
    pathname === '/dev/reset-onboarding' ||
    pathname === '/dev/login' ||
    pathname.startsWith('/dev/login/')
  );
}

function isTokenAuthenticatedApiRoute(request: NextRequest): boolean {
  // E-sign signing routes use dynamic segments (e.g. /api/v1/esign/sign/:token)
  // so they can't use exact-path matching via TOKEN_AUTH_ROUTES.
  if (request.nextUrl.pathname.startsWith('/api/v1/esign/sign/')) {
    return true;
  }
  // Demo entry route uses dynamic [slug] segment
  if (
    request.nextUrl.pathname.startsWith('/api/v1/demo/') &&
    request.nextUrl.pathname.endsWith('/enter') &&
    request.method.toUpperCase() === 'POST'
  ) {
    return true;
  }
  return TOKEN_AUTH_ROUTES.some(
    (route) =>
      request.nextUrl.pathname === route.path &&
      request.method.toUpperCase() === route.method,
  );
}

function buildReturnTo(request: NextRequest): string {
  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

/** Reject returnTo values that could cause open-redirect or path-traversal. */
function safeReturnTo(value: string | null, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }
  return value;
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
  if (isApi) {
    const target = NextResponse.json({ error: 'Not Found' }, { status: 404 });
    return finaliseResponse(source, target, requestId, origin, isApi, isPreview);
  }
  const redirectUrl = new URL('/select-community', getWebAppOriginFromEnv());
  redirectUrl.searchParams.set('reason', UNKNOWN_SUBDOMAIN_REASON);
  const target = NextResponse.redirect(redirectUrl, 307);
  return finaliseResponse(source, target, requestId, origin, false, isPreview);
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
      Date.now() + TENANT_CACHE_TTL_MS,
  });
}

/**
 * Report a tenant-resolution failure that the caller then swallows.
 *
 * The public-site paths deliberately fall through on error rather than 500, so
 * a visitor gets a page instead of a stack trace. That is the right call for
 * availability and the wrong one for observability: with no community headers
 * the renderer falls back to "Community not found." behind an HTTP 200, which
 * is indistinguishable from a healthy site to `deploy.yml`'s `/auth/login`
 * smoke test and to every uptime monitor. That combination is precisely why
 * the original outage went unnoticed.
 *
 * Resolution now depends on the migration-0045 RPCs, which adds two new ways
 * to throw that did not exist when it read the table directly: the function
 * missing (a database restored without 0045), or `EXECUTE` revoked from `anon`
 * — and 0045's own header records that Supabase advisor lints 0028/0029 flag
 * these functions and recommend exactly that revoke. If someone acts on the
 * lint, this is the signal that says so.
 *
 * Cardinality: fixed event name, variable parts in `extra`.
 */
function reportTenantResolutionFailure(
  source: 'host_subdomain' | 'custom_domain',
  host: string | null,
  error: unknown,
): void {
  captureMessage('tenant_resolution_failed', {
    level: 'error',
    extra: {
      source,
      host,
      reason: error instanceof Error ? error.message : String(error),
    },
  });
}

/**
 * Resolve a tenant host to a community id.
 *
 * Goes through the `pp_public_community_id_by_slug` RPC (migration 0045), NOT
 * a direct read of `communities`.
 *
 * This client is built with the ANON key, so an unauthenticated visitor runs as
 * `anon`. `communities.pp_communities_select` requires
 * `pp_rls_has_community_membership(id)`, whose body begins
 * `WHEN auth.uid() IS NULL THEN false` — so the direct read this replaced
 * matched zero rows for every anonymous request. `x-community-id` was never
 * set and every community's public site rendered "Community not found." behind
 * an HTTP 200.
 *
 * It looked fine to anyone testing because an authenticated member DOES pass
 * the membership check; the only visitor who saw the failure was the anonymous
 * public, which is the entire audience of a §718.111(12)(g) transparency page.
 *
 * The RPC is SECURITY DEFINER and returns only a bigint, so RLS on
 * `communities` stays exactly as it was — see 0045 for why an anon SELECT
 * policy would have been the wrong fix.
 */
async function findCommunityIdBySlug(
  supabase: Awaited<ReturnType<typeof createMiddlewareClient>>['supabase'],
  slug: string,
): Promise<number | null> {
  const cached = readTenantCache(slug);
  if (cached !== undefined) {
    return cached;
  }

  const { data, error } = await supabase.rpc('pp_public_community_id_by_slug', {
    p_slug: slug,
  });

  if (error) {
    throw new Error(error.message);
  }

  const communityId = typeof data === 'number' && Number.isInteger(data) ? data : null;

  writeTenantCache(slug, communityId);
  return communityId;
}

async function findCommunityIdByCustomDomain(
  supabase: Awaited<ReturnType<typeof createMiddlewareClient>>['supabase'],
  host: string,
): Promise<number | null> {
  const key = `cd:${host}`;
  const cached = readTenantCache(key);
  if (cached !== undefined && cached !== null) return cached; // positive-only
  // Same anon/RLS problem as findCommunityIdBySlug — a custom-domain visitor is
  // no more authenticated than a subdomain one. See migration 0045.
  const { data, error } = await supabase.rpc('pp_public_community_id_by_domain', {
    p_host: host,
  });
  if (error) throw new Error(error.message);
  const id = typeof data === 'number' && Number.isInteger(data) ? data : null;
  if (id !== null) writeTenantCache(key, id);
  return id;
}

function sanitizeForwardedHeaders(request: NextRequest, requestId: string): Headers {
  const headers = new Headers(request.headers);
  for (const header of FORWARDED_AUTH_HEADERS) {
    headers.delete(header);
  }
  headers.set('x-request-id', requestId);
  return headers;
}

function stampForwardedUserHeaders(
  forwardedHeaders: Headers,
  user: {
    id: string;
    email?: string | null;
    phone?: string | null;
    user_metadata?: { full_name?: unknown } | null;
  } | null,
): void {
  if (!user) {
    return;
  }

  forwardedHeaders.set(USER_ID_HEADER, user.id);

  const email = normalizeForwardedHeaderValue(user.email);
  if (email) {
    forwardedHeaders.set(USER_EMAIL_HEADER, email);
  }

  const phone = normalizeForwardedHeaderValue(user.phone);
  if (phone) {
    forwardedHeaders.set(USER_PHONE_HEADER, phone);
  }

  const fullName = normalizeForwardedHeaderValue(
    typeof user.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name
      : null,
  );
  if (fullName) {
    forwardedHeaders.set(USER_FULL_NAME_HEADER, fullName);
  }
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
  if (shouldHideDevSurfaceInProduction(pathname)) {
    return NextResponse.rewrite(new URL('/404', request.url));
  }

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'getpropertypro.com';
  const pathPublic = parsePathBasedPublicRoute(pathname);
  if (pathPublic && isApexHost(request.headers.get('host'), rootDomain)) {
    return NextResponse.redirect(buildCommunityUrl(pathPublic.slug, pathPublic.path), 308);
  }

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

  // ── CSRF Origin/Referer enforcement for state-changing API routes ──
  const method = request.method.toUpperCase();
  if (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
    pathname.startsWith('/api/v1/') &&
    !isTokenAuthenticatedApiRoute(request)
  ) {
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    if (origin && !isAllowedOrigin(origin)) {
      return NextResponse.json({ error: 'Forbidden: invalid origin' }, { status: 403 });
    }
    if (!origin && referer && !isAllowedReferer(referer)) {
      return NextResponse.json({ error: 'Forbidden: invalid referer' }, { status: 403 });
    }
  }

  // Refresh Supabase session (reads + writes cookies)
  const authStartedAt = performance.now();
  const {
    supabase,
    response,
    user: middlewareUser,
    authChecked,
  } = await createMiddlewareClient(
    request as unknown as Parameters<typeof createMiddlewareClient>[0],
  );
  if (process.env.MIDDLEWARE_TIMING === '1') {
    console.log(
      `[mw-auth] ${(performance.now() - authStartedAt).toFixed(1)}ms authChecked=${authChecked} ${pathname}`,
    );
  }
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const forwardedHeaders = sanitizeForwardedHeaders(request, requestId);

  /**
   * Whether this request may see UNPUBLISHED site content [11b-2].
   *
   * `?preview=true` is visitor-controlled — it is a query string, nothing more.
   * `x-preview` is what the public-site renderer trusts to switch to draft
   * reads, and 11b-2 threads it to the PAGE-row lookup as well as the block
   * lookup, so an ungated stamp would let any anonymous visitor read a page the
   * PM created but never published by appending `?preview=true`. D7 ("an
   * unpublished page is a 404 to the public") only holds if the stamp is gated.
   *
   * The gate is "there is a signed-in user", not "this user may edit this
   * community's site": the latter needs a per-request DB read in middleware,
   * which runs on every request. That narrows the exposure from *anyone on the
   * internet* to *someone with an account*, which is the property D7 is about.
   * A signed preview token is the right long-term fix and belongs with the
   * editor's share-a-preview feature, not here.
   */
  const canPreviewDrafts = isPreviewRequest && middlewareUser != null;

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
      // `foreignHost()` needs this to classify a non-root host as
      // 'custom_domain'. Without it a foreign host fell through to the
      // subdomain path and its FIRST LABEL was read as a PropertyPro slug —
      // so `sunset-condos.example.com/dashboard` resolved the real
      // `sunset-condos` community and forwarded its x-community-id from a host
      // we do not control. Membership checks downstream still gated the data,
      // but tenant context must not be resolvable off a foreign host at all.
      //
      // Per design decision D4 a custom domain serves the public `/` site
      // ONLY — residents authenticate on the subdomain — so there is
      // deliberately no custom-domain resolution here. 'custom_domain' carries
      // null communityId AND null tenantSlug, so every branch below is skipped
      // and the request falls through to the missing-tenant redirect. See
      // docs/superpowers/specs/2026-06-03-custom-domain-support-design.md
      // (D4, and "Out of scope: Custom domain on /auth/* and /dashboard").
      rootDomain,
    });

    if (tenantContext.isReservedSubdomain) {
      // Reserved subdomains (www, admin, pm, etc.) are NOT tenant slugs.
      // Skip tenant resolution — proceed without community context.
      // Routes that need tenant context will handle the missing header themselves.
    } else if (tenantContext.communityId) {
      // Forward community ID from query param so layouts can read it from headers
      forwardedHeaders.set(COMMUNITY_ID_HEADER, String(tenantContext.communityId));
      forwardedHeaders.set(TENANT_SOURCE_HEADER, tenantContext.source);
    } else if (tenantContext.tenantSlug) {
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

    // Fallback: extract community ID from /communities/[id]/... URL path.
    // Pages under this route receive the ID via params, but the shell layout
    // reads it from the x-community-id header. Without this, the notification
    // bell and other shell features show as disabled on these pages.
    if (!forwardedHeaders.has(COMMUNITY_ID_HEADER)) {
      const pathCommunityMatch = /^\/communities\/(\d+)/.exec(pathname);
      if (pathCommunityMatch?.[1]) {
        forwardedHeaders.set(COMMUNITY_ID_HEADER, pathCommunityMatch[1]);
        forwardedHeaders.set(TENANT_SOURCE_HEADER, 'path_segment');
      }
    }
  }

  // --- Mobile preview bypass (demo iframe) ---
  // Skip auth for the /mobile root in preview mode so the admin-app iframe
  // (different origin) can render the published template without cookies.
  // Sub-routes (/mobile/announcements, etc.) remain fully protected.
  if (pathname === '/mobile' && isPreviewRequest) {
    forwardedHeaders.set('x-preview', 'true');
    const previewResp = NextResponse.next({ request: { headers: forwardedHeaders } });
    return finaliseResponse(
      response as unknown as NextResponse,
      previewResp,
      requestId,
      origin,
      isApi,
      true,
    );
  }

  // --- Host precedence: verified custom domains are public end to end [11b-0] ---
  //
  // This sits ABOVE the protected-path check on purpose, and it is the only
  // place host resolution is allowed to outrank it.
  //
  // A verified custom domain serves the community's public website and nothing
  // else (design decision D4 — residents authenticate on the subdomain). So a
  // request there for `/documents` is a request for a PAGE named Documents, not
  // for the app's document library. Without this, `isProtectedPath` catches it
  // first and redirects to login, and the public site can never own more than
  // one URL.
  //
  // Deliberately NOT extended to community subdomains. A subdomain serves the
  // authenticated app as well as the public root — `community-tenant-host-
  // precedence.spec.ts` loads `/dashboard` on one and expects the dashboard —
  // so granting host precedence there would route every resident's app to the
  // public renderer. On a subdomain the app route wins and public page slugs are
  // reserved against it (`isReservedPublicSlug`).
  //
  // The safety property this must never break: on the APP host, nothing here
  // applies, because `custom_domain` is only ever the source for a host that is
  // neither the root domain nor one of its subdomains.
  if (isPublicSitePath(pathname)) {
    const hostContext = resolveCommunityContext({
      searchParams: request.nextUrl.searchParams,
      host: request.headers.get('host'),
      rootDomain,
    });

    if (hostContext.source === 'custom_domain' && hostContext.customDomainHost) {
      try {
        const communityId = await findCommunityIdByCustomDomain(
          supabase,
          hostContext.customDomainHost,
        );
        if (communityId != null) {
          forwardedHeaders.set(COMMUNITY_ID_HEADER, String(communityId));
          forwardedHeaders.set(TENANT_SOURCE_HEADER, 'custom_domain');
          // Gated on a session, not on the query param alone — see
          // `canPreviewDrafts`. An anonymous `?preview=true` gets the published
          // site, which is what D7 promises.
          if (canPreviewDrafts) {
            forwardedHeaders.set('x-preview', 'true');
          }

          const firstSegment = pathname.split('/').filter(Boolean)[0];

          // Metadata routes own themselves [11b-2 / D12+D14]. `isPublicSitePath`
          // says yes to `/sitemap.xml`, so before this the custom domain
          // rewrote both metadata routes into the public-site renderer and
          // served a 404 for each — on the one host where a per-page sitemap
          // actually matters. They need the tenant headers, though, which is
          // why they fall THROUGH (carrying `forwardedHeaders` to the final
          // `NextResponse.next`) rather than being excluded outright.
          if (firstSegment !== undefined && METADATA_FIRST_SEGMENTS.has(firstSegment)) {
            // fall through — no rewrite, headers already stamped
          } else {
            // A path-public suffix with a host-native renderer goes to that
            // renderer, not to the public-site one [11b-2 / D13]. Previously
            // this block pre-empted the `/transparency` → `/public-transparency`
            // branch further down, which itself refuses `custom_domain`, so
            // `/transparency` 404'd on every custom domain.
            const hostNative =
              firstSegment !== undefined
                ? HOST_NATIVE_PUBLIC_SUFFIX_ROUTES[firstSegment]
                : undefined;

            // Otherwise preserve the path. The renderer is a catch-all, so `/`
            // and `/anything` both reach it and it decides what exists.
            const siteUrl = request.nextUrl.clone();
            siteUrl.pathname =
              hostNative ?? `/public-site${pathname === '/' ? '' : pathname}`;
            return finaliseResponse(
              response as unknown as NextResponse,
              NextResponse.rewrite(siteUrl, { request: { headers: forwardedHeaders } }),
              requestId,
              origin,
              isApi,
              isPreviewRequest,
            );
          }
        }
        // Unknown/unverified custom host: fall through to default handling.
      } catch (error) {
        // Non-fatal, but reported — a silent throw here is how the original
        // tenant-resolution outage stayed invisible behind an HTTP 200.
        reportTenantResolutionFailure('custom_domain', hostContext.customDomainHost, error);
      }
    }
  }

  // --- Community subdomain: public website vs authenticated app [11b-2] ---
  //
  // A subdomain serves BOTH surfaces, so this is the fork between them — and it
  // sits ABOVE `isProtectedPath` on purpose (D2). Below it, `isProtectedPath`'s
  // *prefix* match silently swallows any slug that merely begins with a
  // protected string (`documents-2024` → `/documents`), and the fork becomes
  // invisible to the reserved-slug validator the editor already runs at write
  // time. Above it, one function — `classifySubdomainPath` — decides, and
  // `isReservedPublicSlug` (derived from `PROTECTED_PATH_PREFIXES`) is the same
  // predicate on both sides.
  //
  // The app always wins a reserved slug: `/dashboard` on a subdomain is the
  // resident's dashboard, never a page named Dashboard.
  // `community-tenant-host-precedence.spec.ts` asserts exactly that against a
  // real subdomain.
  //
  // Custom domains are handled entirely by the host-precedence block above,
  // which runs for every path; a 'custom_domain' source that reached here is
  // unresolved or inactive and must fall through to default handling rather
  // than render a community-less public site on a foreign host.
  const publicHostContext = resolveCommunityContext({
    searchParams: request.nextUrl.searchParams,
    host: request.headers.get('host'),
    rootDomain,
  });

  const hasPublicHostCommunityContext =
    publicHostContext.source !== 'none' &&
    publicHostContext.source !== 'custom_domain' &&
    !publicHostContext.isReservedSubdomain;

  if (hasPublicHostCommunityContext) {
    // Path-preserving public routing is a HOST property, so it applies only to
    // a real community subdomain. `?communityId=`/`?tenant=` on some other host
    // still gets the historical `/` behaviour and nothing more — widening it
    // would let a query param turn an app host's URLs into public pages.
    const pathKind =
      pathname === '/'
        ? ('site-root' as const)
        : publicHostContext.source === 'host_subdomain'
          ? classifySubdomainPath(pathname)
          : ('app' as const);

    if (pathKind !== 'app') {
      if (publicHostContext.communityId) {
        forwardedHeaders.set(COMMUNITY_ID_HEADER, String(publicHostContext.communityId));
        forwardedHeaders.set(TENANT_SOURCE_HEADER, publicHostContext.source);
      } else if (publicHostContext.tenantSlug) {
        try {
          const communityId = await findCommunityIdBySlug(
            supabase,
            publicHostContext.tenantSlug,
          );
          if (communityId != null) {
            forwardedHeaders.set(COMMUNITY_ID_HEADER, String(communityId));
            forwardedHeaders.set(TENANT_SLUG_HEADER, publicHostContext.tenantSlug);
            forwardedHeaders.set(TENANT_SOURCE_HEADER, publicHostContext.source);
          }
        } catch (error) {
          // Non-fatal for the public site — continue without community headers
          // so a visitor gets a page rather than a 500. But REPORT it first:
          // swallowing this silently is exactly how the original outage lasted
          // as long as it did. Without the community headers the renderer
          // falls back to "Community not found." behind an HTTP 200, which
          // deploy.yml's /auth/login smoke test and every uptime monitor read
          // as healthy. The protected path does not need this — it returns a
          // loud internalErrorResponse for the same throw.
          reportTenantResolutionFailure('host_subdomain', publicHostContext.tenantSlug, error);
        }
      }

      // `sitemap.xml` / `robots.txt` need the tenant headers but must reach
      // their own handlers, so they fall through with the headers stamped
      // (D14). Before this, `x-community-id` was never set for them on a
      // subdomain, which made sitemap.ts's search-indexing opt-out and its
      // per-document URLs dead code in production.
      if (pathKind !== 'metadata') {
        // The public site is served to EVERYONE, signed in or not [11b-0].
        //
        // This used to redirect an authenticated visitor to /dashboard, which
        // was tolerable while the public site was a single page but is not once
        // it has real URLs: a resident following a link to their community's
        // own website would land on the app dashboard instead of the page they
        // were sent, and every shared public link would be broken for exactly
        // the people most likely to share it. Managers also had to append
        // `?preview=true` to look at their own live site.
        //
        // Reaching the app from here is one click on the site's own header;
        // being unable to see a public page you are logged in to is not
        // recoverable.

        // Forward x-preview=true so the renderer can switch to draft reads
        // (PR #8c). NOT the /mobile pattern above: that one is deliberately
        // cookie-less because it renders a published demo template, whereas
        // this one exposes unpublished pages and blocks, so it is gated on a
        // session — see `canPreviewDrafts`.
        if (canPreviewDrafts) {
          forwardedHeaders.set('x-preview', 'true');
        }
        const siteUrl = request.nextUrl.clone();
        siteUrl.pathname = pathKind === 'site-root' ? '/public-site' : `/public-site${pathname}`;
        return finaliseResponse(
          response as unknown as NextResponse,
          NextResponse.rewrite(siteUrl, { request: { headers: forwardedHeaders } }),
          requestId,
          origin,
          isApi,
          isPreviewRequest,
        );
      }
    }
  }

  // Only enforce auth checks on protected paths
  if (isProtectedPath(pathname)) {
    const isTokenAuthRoute = isTokenAuthenticatedApiRoute(request);
    const user = middlewareUser;

    stampForwardedUserHeaders(forwardedHeaders, user);

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

    if (user && !isTokenAuthRoute && !user.emailVerified && pathname !== VERIFY_EMAIL_PATH) {
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

    if (user && !isApiPath(pathname) && pathname === '/pm/dashboard/communities/new') {
      const communitiesUrl = request.nextUrl.clone();
      communitiesUrl.pathname = '/pm/dashboard/communities';
      communitiesUrl.search = '';
      return finaliseResponse(
        response as unknown as NextResponse,
        NextResponse.redirect(communitiesUrl),
        requestId,
        origin,
        isApi,
        isPreviewRequest,
      );
    }

    // Missing-tenant redirect: an authenticated user landed on a protected
    // page without any community context (e.g. www.getpropertypro.com/settings,
    // or apex/dashboard with no ?communityId=). Without a forwarded
    // x-community-id header, the app shell renders with community=null and
    // every sidebar tab is unclickable. Bounce to /select-community, which
    // auto-redirects single-community users back to their dashboard.
    //
    // Carve-outs:
    //   - /select-community itself (loop prevention)
    //   - /pm/* — the PM portfolio is a cross-community view that doesn't
    //     need a single tenant in scope
    //   - API routes — clients shouldn't follow redirects; existing handlers
    //     already throw ValidationError("communityId query parameter is required")
    if (
      user &&
      !isApiPath(pathname) &&
      !forwardedHeaders.has(COMMUNITY_ID_HEADER) &&
      pathname !== '/select-community' &&
      !pathname.startsWith('/pm/')
    ) {
      const selectUrl = request.nextUrl.clone();
      selectUrl.pathname = '/select-community';
      selectUrl.search = '';
      selectUrl.searchParams.set('returnTo', buildReturnTo(request));
      return finaliseResponse(
        response as unknown as NextResponse,
        NextResponse.redirect(selectUrl),
        requestId,
        origin,
        isApi,
        isPreviewRequest,
      );
    }
  }

  // --- Host-native public transparency [Wave 2] ---
  // When a community subdomain requests '/transparency', rewrite to the
  // internal public-transparency renderer with tenant headers injected.
  if (shouldRewriteHostTransparency(pathname)) {
    const tenantContext = resolveCommunityContext({
      searchParams: request.nextUrl.searchParams,
      host: request.headers.get('host'),
      rootDomain,
    });

    const hasCommunityContext =
      tenantContext.source !== 'none' &&
      tenantContext.source !== 'custom_domain' &&
      !tenantContext.isReservedSubdomain;

    if (hasCommunityContext) {
      if (tenantContext.communityId) {
        forwardedHeaders.set(COMMUNITY_ID_HEADER, String(tenantContext.communityId));
        forwardedHeaders.set(TENANT_SOURCE_HEADER, tenantContext.source);
      } else if (tenantContext.tenantSlug) {
        forwardedHeaders.set(TENANT_SLUG_HEADER, tenantContext.tenantSlug);
        try {
          const communityId = await findCommunityIdBySlug(supabase, tenantContext.tenantSlug);
          if (communityId != null) {
            forwardedHeaders.set(COMMUNITY_ID_HEADER, String(communityId));
            forwardedHeaders.set(TENANT_SOURCE_HEADER, tenantContext.source);
          }
        } catch {
          // Non-fatal — public-transparency resolves slug server-side when RLS blocks anon lookup
        }
      }

      const transparencyUrl = request.nextUrl.clone();
      transparencyUrl.pathname = '/public-transparency';
      const transparencyResponse = NextResponse.rewrite(transparencyUrl, {
        request: { headers: forwardedHeaders },
      });
      return finaliseResponse(
        response as unknown as NextResponse,
        transparencyResponse,
        requestId,
        origin,
        isApi,
        isPreviewRequest,
      );
    }
  }

  // --- Tenant resolution for auth pages (branded login) ---
  // When a community subdomain serves an auth page (e.g. sunset-condos.getpropertypro.com/auth/login),
  // inject x-community-id so the page can display community branding.
  // Non-blocking: unknown subdomains silently fall through to generic login.
  if (pathname.startsWith(AUTH_PATH_PREFIX)) {
    const authTenantContext = resolveCommunityContext({
      searchParams: request.nextUrl.searchParams,
      host: request.headers.get('host'),
      // Same reason as the protected-route call site: without this, a foreign
      // host's first label is read as a PropertyPro slug, so
      // `sunset-condos.example.com/auth/login` would render the real
      // `sunset-condos` community's branding on a host we do not control.
      // Branded auth on a custom domain is an explicit non-goal (D4), and a
      // foreign host never carries a PropertyPro session, so 'custom_domain'
      // is intentionally left to fall through to generic login.
      rootDomain,
    });

    if (!authTenantContext.isReservedSubdomain && authTenantContext.source !== 'none') {
      if (authTenantContext.communityId) {
        forwardedHeaders.set(COMMUNITY_ID_HEADER, String(authTenantContext.communityId));
        forwardedHeaders.set(TENANT_SOURCE_HEADER, authTenantContext.source);
      } else if (authTenantContext.tenantSlug) {
        try {
          const communityId = await findCommunityIdBySlug(supabase, authTenantContext.tenantSlug);
          if (communityId != null) {
            forwardedHeaders.set(COMMUNITY_ID_HEADER, String(communityId));
            forwardedHeaders.set(TENANT_SLUG_HEADER, authTenantContext.tenantSlug);
            forwardedHeaders.set(TENANT_SOURCE_HEADER, authTenantContext.source);
          }
          // If communityId is null (unknown slug): silently continue — no 404
        } catch {
          // Non-fatal for auth pages — continue without community headers
        }
      }
    }
  }

  // Redirect already-authenticated users away from auth pages. Exclusions:
  // - verify-email: users arrive here precisely because they have an
  //   unconfirmed session.
  // - reset-password: users arrive here with a live Supabase recovery
  //   session (PKCE code exchange on page load). Redirecting would intercept
  //   the password-update Server Action POST before `supabase.auth.updateUser()`
  //   can run, silently failing the reset.
  if (
    pathname.startsWith(AUTH_PATH_PREFIX) &&
    pathname !== VERIFY_EMAIL_PATH &&
    pathname !== RESET_PASSWORD_PATH
  ) {
    const user = middlewareUser;

    if (user) {
      if (!user.emailVerified) {
        const verifyUrl = request.nextUrl.clone();
        verifyUrl.pathname = VERIFY_EMAIL_PATH;
        const returnTo = request.nextUrl.searchParams.get('returnTo');
        if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
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

      const destination = request.nextUrl.clone();
      const hasTenantContext = forwardedHeaders.has(COMMUNITY_ID_HEADER);
      const fallback = hasTenantContext ? '/dashboard' : '/select-community';
      destination.pathname = safeReturnTo(request.nextUrl.searchParams.get('returnTo'), fallback);
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

  // --- Support impersonation detection [Task 9] ---
  // If a support session cookie is present, validate it and enforce read-only mode.
  // Invalid/expired cookies are cleared. Valid sessions inject headers for downstream use.
  const supportCookieValue = request.cookies.get(SUPPORT_SESSION_COOKIE)?.value;
  if (supportCookieValue) {
    const currentCommunityId = Number(forwardedHeaders.get(COMMUNITY_ID_HEADER));
    const supportSession = await resolveActiveSupportSession(supportCookieValue, {
      expectedCommunityId:
        Number.isInteger(currentCommunityId) && currentCommunityId > 0
          ? currentCommunityId
          : null,
    });

    if (!supportSession) {
      // Cookie is invalid or expired — clear it
      const clearResponse = NextResponse.next({ request: { headers: forwardedHeaders } });
      const finalClear = finaliseResponse(
        response as unknown as NextResponse,
        clearResponse,
        requestId,
        origin,
        isApi,
        isPreviewRequest,
      );
      // Must carry the SAME name/domain/path the admin console set, or this
      // writes a second host-only cookie instead of removing the domain-scoped
      // one — leaving the invalid cookie in place on every tenant subdomain.
      finalClear.cookies.set(
        buildSupportSessionClearCookie(resolveSupportCookieHostname(request)),
      );
      return finalClear;
    }

    // Block mutations for read_only sessions on API routes (except session
    // management routes).
    //
    // KNOWN GAP: gated on `isApi`, so it does not cover Server Actions, which
    // POST to the *page* path. Harmless today — the only two `'use server'`
    // modules are `lib/auth/actions.ts` and `lib/actions/checkout.ts`, both
    // pre-tenant signup flows unreachable inside an impersonated session — but
    // a new server action would be silently writable under a `read_only`
    // session. Extend this check before adding one.
    if (
      supportSession.scope === 'read_only' &&
      isApi &&
      isReadOnlyBlocked(request.method) &&
      !pathname.startsWith('/api/v1/support/')
    ) {
      return finaliseResponse(
        response as unknown as NextResponse,
        NextResponse.json(
          { error: 'Forbidden: support session is read-only' },
          { status: 403 },
        ),
        requestId,
        origin,
        isApi,
        isPreviewRequest,
      );
    }

    // Stamp support session headers for downstream route handlers.
    //
    // The identity headers must ALL move together. This block used to override
    // only the id, leaving USER_EMAIL_HEADER / USER_FULL_NAME_HEADER set to the
    // authenticating admin's values from earlier in this function. The page
    // shell builds its user entirely from these three headers
    // (lib/request/page-auth-context.ts), so the chrome showed the *admin's*
    // name and email above the *impersonated user's* data — an operator could
    // not tell from the account menu whose account they were in.
    //
    // Name and email come from the signed token (resolved once when the session
    // was created), so correcting this costs no per-request lookup.
    forwardedHeaders.set(USER_ID_HEADER, supportSession.sub);

    // Absent claim → CLEAR, never inherit. A token signed before these claims
    // existed is still valid, and falling back to the admin's identity is the
    // exact bug being fixed. An anonymous account menu is the safe degradation.
    //
    // These MUST go through `normalizeForwardedHeaderValue`, exactly as the
    // non-impersonated path above does. The values originate in `users.full_name`
    // / `users.email`, which are free text: a CR/LF (reachable via the CSV
    // resident import) makes `Headers.set` THROW, and the throw is uncaught here,
    // so every request carrying the support cookie would 500 until the session
    // expired — the operator could not even navigate away to end it. The helper
    // also maps whitespace-only to null, so a blank name clears rather than
    // setting an empty header.
    const impersonatedName = normalizeForwardedHeaderValue(supportSession.target_name);
    if (impersonatedName) {
      forwardedHeaders.set(USER_FULL_NAME_HEADER, impersonatedName);
    } else {
      forwardedHeaders.delete(USER_FULL_NAME_HEADER);
    }

    const impersonatedEmail = normalizeForwardedHeaderValue(supportSession.target_email);
    if (impersonatedEmail) {
      forwardedHeaders.set(USER_EMAIL_HEADER, impersonatedEmail);
    } else {
      forwardedHeaders.delete(USER_EMAIL_HEADER);
    }

    // Phone is forwarded too (line ~426) and has no counterpart claim: it is not
    // shown in the chrome, and adding a phone number to a signed token that
    // rides in a cookie is a worse trade than dropping it. Always cleared, so
    // the admin's phone never reaches an impersonated request.
    forwardedHeaders.delete(USER_PHONE_HEADER);

    forwardedHeaders.set(SUPPORT_SESSION_HEADER, '1');
    forwardedHeaders.set(SUPPORT_ADMIN_ID_HEADER, supportSession.act.sub);
    forwardedHeaders.set(SUPPORT_SESSION_ID_HEADER, String(supportSession.session_id));
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
     * - Public assets (svg, png, jpg, jpeg, gif, webp, ico, mjs)
     * - PDF.js browser assets served from /public/pdfjs
     */
    '/((?!_next/static|_next/image|favicon\\.ico|pdfjs/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mjs)$).*)',
  ],
};
