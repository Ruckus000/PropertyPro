import type { CookieOptionsWithName } from '@supabase/ssr';

/**
 * Admin-specific Supabase cookie configuration.
 *
 * Uses a distinct cookie name so the admin app's session cookies don't collide
 * with the web app's when both run on localhost. (Browsers scope cookies by
 * hostname, not port — RFC 6265.)
 *
 * ## Why this does not reuse `getCookieOptions()` from `@propertypro/db`
 *
 * Two reasons, and both matter:
 *
 * 1. **`domain` must NOT be set.** The shared helper's whole purpose is to set
 *    a wildcard `domain` (`.getpropertypro.com`) so a session is shared across
 *    tenant subdomains. Admin wants the opposite: a host-scoped cookie, so that
 *    signing into the admin console is a separate act from signing into the web
 *    app. That isolation is intentional and must survive.
 *
 * 2. **`secure` must not depend on `NEXT_PUBLIC_COOKIE_DOMAIN`.** The shared
 *    helper returns `undefined` outright when that variable is unset, and
 *    `secure: true` is only ever attached alongside a `domain`. So merging it
 *    here would still leave the admin cookie without `secure` in exactly the
 *    configuration admin actually runs in. It is set explicitly below instead.
 *
 * This file previously exported `{ name }` alone, which was passed to
 * `createServerClient` — and `packages/db/src/supabase/middleware.ts` does
 * `cookieOptions ?? getCookieOptions()`, so supplying any object at all
 * REPLACED the shared defaults rather than merging with them. The session
 * isolation was intended; losing `secure: true` in production was not.
 *
 * Keep this module dependency-free: two of its consumers
 * (`app/auth/login/page.tsx`, `components/shell/RailFooter.tsx`) are client
 * components.
 */
export const ADMIN_COOKIE_OPTIONS: CookieOptionsWithName = {
  name: 'sb-admin-auth-token',
  /**
   * Stated, not inherited.
   *
   * `@supabase/ssr` spreads its own `DEFAULT_COOKIE_OPTIONS` beneath whatever a
   * caller passes, and that constant already sets `sameSite: 'lax'`. So this
   * line changes no behaviour today — it changes what a change would cost.
   *
   * `SameSite=Lax` is the ONLY thing standing between a cross-site form POST and
   * the five money-moving billing routes, and until now no file in this repo
   * stated it and no test pinned it. A `@supabase/ssr` bump that altered the
   * default would have been a silent CSRF regression with every check green —
   * the same failure shape as the `NEXT_PUBLIC_COOKIE_DOMAIN` incident this
   * file's docblock already records. Writing it here makes it ours, and
   * `cookie-config.test.ts` asserts it. (`parseJsonBody` closes the same hazard
   * independently by requiring `application/json`; neither control should be the
   * only one.)
   *
   * Explicit also matters on its own terms: Chrome's "Lax+POST" two-minute
   * grace applies only to cookies that OMIT the attribute.
   */
  sameSite: 'lax',
  // Next inlines NODE_ENV at build time, so this is correct in the client
  // bundles too. `domain` is deliberately absent — see above.
  ...(process.env.NODE_ENV === 'production' && { secure: true }),
};
