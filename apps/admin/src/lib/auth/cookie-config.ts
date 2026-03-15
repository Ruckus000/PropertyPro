/**
 * Admin-specific Supabase cookie configuration.
 *
 * Uses a distinct cookie name so the admin app's session cookies
 * don't collide with the web app's when both run on localhost.
 * (Browsers scope cookies by hostname, not port — RFC 6265.)
 */
export const ADMIN_COOKIE_OPTIONS = { name: 'sb-admin-auth-token' } as const;
