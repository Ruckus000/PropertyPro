/**
 * Session-gate bypass table for token-authenticated `/api/v1` routes.
 *
 * `/api/v1` is a protected prefix, so `middleware.ts` 401s every request under
 * it that carries no session — unless `isTokenAuthenticatedApiRoute` says the
 * route authenticates with a signed token / signature instead. The same
 * predicate also exempts those routes from the CSRF Origin/Referer check,
 * since a provider webhook or a mail client's one-click POST sends no Origin.
 *
 * Lives here rather than inline in `middleware.ts` because it is the part of
 * middleware that churns (one entry per new sessionless route), and because
 * `pnpm guard:token-auth-routes` (`scripts/verify-token-auth-routes.ts`) parses
 * the `TOKEN_AUTH_ROUTES` array literal out of THIS file. Keep the literal's
 * `{ path: '…', method: '…' }` shape, or that guard refuses to pass (exit 2).
 *
 * Edge-safe by construction: imported by `middleware.ts`, which runs on the
 * Edge runtime. No `node:*` imports, no DB, no runtime imports at all.
 */
import type { NextRequest } from 'next/server';

export const TOKEN_AUTH_ROUTES: ReadonlyArray<{ path: string; method: string }> = [
  { path: '/api/v1/invitations', method: 'PATCH' },
  { path: '/api/v1/auth/signup', method: 'GET' },
  // Email-first signup step 1: takes an email, sends a sign-in link; no session yet
  { path: '/api/v1/auth/signup/start', method: 'POST' },
  // Snowbird digest one-click unsubscribe: HMAC-token-authenticated, no session (CAN-SPAM)
  { path: '/api/v1/snowbird-digest/unsubscribe', method: 'GET' },
  // Insurance alerts unsubscribe: HMAC-token-authenticated, no session (CAN-SPAM);
  // GET backs the human-clicked link, POST is the RFC 8058 one-click target.
  { path: '/api/v1/insurance-alerts/unsubscribe', method: 'GET' },
  { path: '/api/v1/insurance-alerts/unsubscribe', method: 'POST' },
  // Community bulk-email one-click unsubscribe — announcements, the notification
  // pipeline, the digest and calendar reminders. HMAC-token-authenticated, no
  // session (CAN-SPAM + RFC 8058): GET backs the link a human clicks, POST is
  // the List-Unsubscribe-Post target a mail client fires with no cookies.
  //
  // BOTH verbs, deliberately. `isTokenAuthenticatedApiRoute` matches on exact
  // path AND method, so a GET-only entry leaves Gmail's POST 401'd — the exact
  // shape that once broke every cron. Enforced now by guard:token-auth-routes.
  { path: '/api/v1/notifications/unsubscribe', method: 'GET' },
  { path: '/api/v1/notifications/unsubscribe', method: 'POST' },
  // Stripe webhook: signature-verified by handler, no session required [P2-34]
  { path: '/api/v1/webhooks/stripe', method: 'POST' },
  // Demo auto-auth: HMAC-token-validated, no session required [Task 2.4-2.6]
  { path: '/api/v1/auth/demo-login', method: 'GET' },
  // Public transparency page data endpoint (community opt-in gated)
  { path: '/api/v1/transparency', method: 'GET' },
  // Twilio SMS delivery webhook: HMAC-signature-verified by handler [Phase 1B]
  { path: '/api/v1/webhooks/twilio', method: 'POST' },
  // Inbound support mail (Forward Email): HMAC-signature-verified by the handler
  // via verifyForwardEmailWebhookToken, no session. POST only — the provider
  // issues nothing else. A provider POST carries no Origin header, so the CSRF
  // check must be skipped or every delivery 403s.
  { path: '/api/v1/webhooks/inbound-email', method: 'POST' },
  // Provisioning status polling: no session yet, signupRequestId-authenticated [Provisioning Screen]
  { path: '/api/v1/auth/provisioning-status', method: 'GET' },
  // Self-service resident signup: public submit + OTP verify (no session required)
  { path: '/api/v1/access-requests', method: 'POST' },
  { path: '/api/v1/access-requests/verify', method: 'POST' },
  // Public community discovery search (rate-limited, returns minimal metadata only)
  { path: '/api/v1/public/communities/search', method: 'GET' },
  // Portfolio inquiry form for property managers (rate-limited, write-only)
  { path: '/api/v1/public/pm-inquiries', method: 'POST' },
];

export function isTokenAuthenticatedApiRoute(request: NextRequest): boolean {
  // Internal scheduled-job routes: ONE prefix rule rather than a per-route
  // entry below.
  //
  // The per-route list is what broke every cron in production. Vercel Cron
  // issues GET; nine routes had a POST-only entry here, so middleware 401'd
  // before the route ever ran (a 401, not the 405 you would expect), and four
  // routes had no entry at all. Every one of those was a separate line someone
  // had to remember to add, and the failure is silent.
  //
  // Safe as a blanket rule because it bypasses only the SESSION gate, never a
  // route's own auth: every route under this prefix calls requireCronSecret(),
  // which fails closed on a missing/short/wrong Bearer token
  // (lib/api/cron-auth.ts). `guard:internal-cron-auth` enforces that invariant
  // in CI, so a future route added here cannot silently become unauthenticated.
  //
  // HEAD is here because an uptime monitor sends it. Measured in production
  // before this line existed: GET /api/v1/internal/cron-health returned 200 and
  // HEAD returned 401, while /api/health answered both — because HEAD fell off
  // the end of this list and hit the session gate. That is the same silent
  // wrong-method 401 described directly above, reproduced one method over by the
  // rule written to prevent it.
  //
  // It matters more than a cosmetic status: a monitor configured to tolerate 401
  // on this probe is blind to the 2026-08 outage, whose signature was every cron
  // returning exactly that. Safe to add — Next derives HEAD from a GET-only
  // route (/api/health exports only GET and answers HEAD 200), and every route
  // under this prefix still calls requireCronSecret, so HEAD fails closed
  // exactly as GET does.
  if (request.nextUrl.pathname.startsWith('/api/v1/internal/')) {
    const method = request.method.toUpperCase();
    return method === 'GET' || method === 'HEAD' || method === 'POST';
  }
  // E-sign signing routes use dynamic segments (e.g. /api/v1/esign/sign/:token)
  // so they can't use exact-path matching via TOKEN_AUTH_ROUTES.
  if (request.nextUrl.pathname.startsWith('/api/v1/esign/sign/')) {
    return true;
  }
  // Anonymous download of a document an association has PUBLISHED to its public
  // site (§718.111(12)(g)). Dynamic [id] segment, so it cannot use exact-path
  // matching. GET only — this route reads one row and redirects; it can neither
  // list documents nor change anything. The route itself is the authorization:
  // `getPublicDocumentFile` returns a row only when `public_access` is true, the
  // row is not soft-deleted, it belongs to the named community, and that
  // community is not itself soft-deleted — the last predicate standing in for
  // the host-resolution gate this route bypasses by taking `communityId` from
  // the query string.
  if (
    request.nextUrl.pathname.startsWith('/api/v1/public/documents/') &&
    request.nextUrl.pathname.endsWith('/download') &&
    request.method.toUpperCase() === 'GET'
  ) {
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
