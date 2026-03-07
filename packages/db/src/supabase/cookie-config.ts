/**
 * Shared cookie options for all Supabase client factories.
 * When NEXT_PUBLIC_COOKIE_DOMAIN is set (e.g. ".propertyprofl.com"),
 * auth cookies are shared across all subdomains.
 *
 * @module supabase/cookie-config
 */
import type { CookieOptionsWithName } from '@supabase/ssr';

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
