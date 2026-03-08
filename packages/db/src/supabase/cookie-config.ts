/**
 * Shared cookie options for all Supabase client factories.
 * When NEXT_PUBLIC_COOKIE_DOMAIN is set (e.g. ".propertyprofl.com"),
 * auth cookies are shared across all subdomains.
 *
 * @module supabase/cookie-config
 */
import type { CookieOptionsWithName } from '@supabase/ssr';

/**
 * Returns cookie options to apply to all Supabase clients.
 *
 * - `domain`: Enables cross-subdomain session sharing via RFC 6265.
 * - `secure`: Forces HTTPS-only cookies in production. `@supabase/ssr` does NOT
 *   set this by default, so without it cookies could be sent over HTTP when a
 *   wildcard domain is configured.
 *
 * Returns `undefined` when NEXT_PUBLIC_COOKIE_DOMAIN is empty/unset, which lets
 * `@supabase/ssr` use its defaults (cookies scoped to the exact hostname).
 */
export function getCookieOptions(): CookieOptionsWithName | undefined {
  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim();
  if (!domain) return undefined;

  if (!domain.startsWith('.')) {
    console.warn(
      `[cookie-config] NEXT_PUBLIC_COOKIE_DOMAIN="${domain}" should start with "." for subdomain sharing (e.g. ".propertyprofl.com")`,
    );
  }

  return {
    domain,
    ...(process.env.NODE_ENV === 'production' && { secure: true }),
  };
}
