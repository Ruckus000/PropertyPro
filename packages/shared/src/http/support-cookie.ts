/**
 * Cookie attributes for the support-impersonation session token.
 *
 * ## Why this lives here and not in `support-access.ts`
 *
 * `support-access.ts` is re-exported by the ROOT barrel (`@propertypro/shared`).
 * 31 web test files do `vi.mock('@propertypro/shared', () => ({ …a few symbols }))`
 * with bare factories, so anything added to the root barrel arrives as
 * `undefined` inside those tests. A cookie builder returning `undefined` would
 * make the *set* silently no-op and the *clear* silently throw — the two
 * failure modes least likely to be noticed. The `http` subpath is invisible to
 * those mocks, so it goes here and imports the constants it needs.
 *
 * ## Why the token is set server-side
 *
 * Until 2026-08-05 the admin console handed the signed JWT to the browser in
 * the POST response body and the client wrote it with `document.cookie`. That
 * cookie could not be `HttpOnly` — `document.cookie` cannot set the flag — and
 * it was scoped `Domain=.getpropertypro.com`, i.e. readable by JavaScript on
 * EVERY tenant subdomain. Any XSS anywhere on the tenant domain could read a
 * live impersonation token for an arbitrary user.
 *
 * The token now never reaches JavaScript: the admin route sets the cookie on
 * its own response with `HttpOnly`, and the web app reads it in middleware.
 *
 * ## Why lifetime is derived, not literal
 *
 * The old client-side write hard-coded `max-age=3600`, inherited from when the
 * session TTL was one hour. The TTL later dropped to 30 minutes
 * (`SUPPORT_SESSION_MAX_TTL_HOURS = 0.5`) and the cookie was not updated, so
 * the cookie outlived both the JWT `exp` and the `support_sessions` row by 30
 * minutes. Deriving it from the same constant makes that class of drift
 * impossible.
 */
import {
  SUPPORT_SESSION_COOKIE,
  SUPPORT_SESSION_MAX_TTL_HOURS,
  getSupportCookieRootDomain,
  isLocalSupportHostname,
} from '../support-access';

/** Cookie lifetime, in seconds — always equal to the JWT TTL. */
export const SUPPORT_SESSION_COOKIE_MAX_AGE_SECONDS = Math.round(
  SUPPORT_SESSION_MAX_TTL_HOURS * 3600,
);

/**
 * Shape accepted by both `NextResponse.cookies.set()` and
 * `ResponseCookies.delete()`. Deliberately not importing Next types — this
 * package is framework-agnostic and is consumed by both apps.
 */
export interface SupportSessionCookieAttributes {
  name: string;
  value: string;
  path: string;
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  maxAge: number;
  /** Omitted entirely on local hostnames, where a host-only cookie is correct. */
  domain?: string;
}

/**
 * Attributes shared by the set and clear paths.
 *
 * These MUST match exactly. A cookie is identified by (name, domain, path);
 * clearing with a different domain writes a *second* cookie rather than
 * removing the first, which is precisely the bug that let an invalidated
 * support cookie survive `cookies.delete(name)` in web middleware.
 */
function baseAttributes(hostname: string): Omit<SupportSessionCookieAttributes, 'value' | 'maxAge'> {
  const rootDomain = getSupportCookieRootDomain(hostname);
  const isLocal = isLocalSupportHostname(hostname);

  return {
    name: SUPPORT_SESSION_COOKIE,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    // Local development runs the admin console on http://localhost:3001 and the
    // web app on http://localhost:3000. Cookies are not port-scoped, so a
    // host-only `localhost` cookie is already shared between them — and a
    // `Secure` cookie over plain http would simply be dropped.
    secure: !isLocal,
    // A dot-prefixed domain is what the tenant subdomains need in production
    // (admin.getpropertypro.com must set a cookie that <slug>.getpropertypro.com
    // can read). Locally there is no parent domain to scope to, and setting one
    // would make the browser reject the cookie outright.
    ...(rootDomain ? { domain: `.${rootDomain}` } : {}),
  };
}

/** Attributes for issuing a support session cookie. */
export function buildSupportSessionCookie(
  hostname: string,
  token: string,
): SupportSessionCookieAttributes {
  return {
    ...baseAttributes(hostname),
    value: token,
    maxAge: SUPPORT_SESSION_COOKIE_MAX_AGE_SECONDS,
  };
}

/**
 * The hostname the cookie should be scoped against, taken from the request.
 *
 * Prefers the forwarded/Host headers over `request.url`: behind Vercel's proxy
 * the URL a route handler sees is not reliably the public host, and the cookie
 * `Domain` has to match what the *browser* is talking to or the browser drops
 * it. In local dev both agree on `localhost`.
 *
 * A spoofed `Host` cannot be used to plant a cookie elsewhere — a browser
 * rejects any `Set-Cookie` whose `Domain` is not a suffix of the host it
 * actually requested — so the worst a forged header achieves is a cookie the
 * browser discards.
 */
export function resolveSupportCookieHostname(request: {
  headers: Headers;
  url: string;
}): string {
  const forwarded =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? null;

  let host: string;
  if (forwarded) {
    // `x-forwarded-host` may be a comma-separated proxy chain; the first entry
    // is the one the client used.
    host = forwarded.split(',')[0]!.trim();
  } else {
    host = new URL(request.url).hostname;
  }

  // Strip the port, keeping IPv6 literals (`[::1]:3000`) intact.
  const withoutPort = host.startsWith('[')
    ? host.slice(0, host.indexOf(']') + 1)
    : host.split(':')[0]!;

  return withoutPort.toLowerCase();
}

/**
 * Attributes for clearing a support session cookie.
 *
 * `maxAge: 0` with an empty value, and the SAME name/domain/path as the set
 * path — see the note on `baseAttributes`.
 */
export function buildSupportSessionClearCookie(
  hostname: string,
): SupportSessionCookieAttributes {
  return {
    ...baseAttributes(hostname),
    value: '',
    maxAge: 0,
  };
}
