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
 * (`app/auth/login/page.tsx`, `components/Sidebar.tsx`) are client components.
 */
export const ADMIN_COOKIE_OPTIONS: CookieOptionsWithName = {
  name: 'sb-admin-auth-token',
  // Next inlines NODE_ENV at build time, so this is correct in the client
  // bundles too. `domain` is deliberately absent — see above.
  ...(process.env.NODE_ENV === 'production' && { secure: true }),
};
