/**
 * Middleware-specific Supabase client.
 * Can read AND write cookies to refresh the session without blocking rendering.
 *
 * @module supabase/middleware
 */
import { createServerClient, type CookieOptionsWithName } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { getCookieOptions } from './cookie-config';

/**
 * The identity middleware resolves for a request.
 *
 * Shape is structurally compatible with the subset of Supabase `User` the
 * app middlewares consume (`id`, `email`, `phone`,
 * `user_metadata.full_name`), so callers that only read those fields need no
 * changes. `emailVerified` replaces reads of `email_confirmed_at`, which is
 * not present in JWT claims.
 */
export interface MiddlewareAuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  user_metadata: { full_name: string | null };
  /**
   * Derived from `claims.user_metadata.email_verified`: GoTrue sets it
   * `false` at email signup and `true` after confirmation. Users created via
   * the admin API with `email_confirm: true` may lack the key entirely, so
   * ABSENT means verified — only an explicit `false` gates.
   */
  emailVerified: boolean;
}

/** Minimal claims shape consumed from `supabase.auth.getClaims()`. */
type AuthClaims = {
  sub: string;
  email?: string;
  phone?: string;
  user_metadata?: Record<string, unknown>;
};

export function toMiddlewareAuthUser(claims: AuthClaims): MiddlewareAuthUser {
  const fullName = claims.user_metadata?.full_name;
  return {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    phone: typeof claims.phone === 'string' ? claims.phone : null,
    user_metadata: {
      full_name: typeof fullName === 'string' ? fullName : null,
    },
    emailVerified: claims.user_metadata?.email_verified !== false,
  };
}

type MiddlewareCookieStore = {
  getAll(): Array<{ name: string; value: string }>;
  set(name: string, value: string): void;
};

export type MiddlewareRequest = Request & {
  cookies: MiddlewareCookieStore;
};

function hasAuthCookie(
  request: MiddlewareRequest,
  cookieOptions?: CookieOptionsWithName,
): boolean {
  const configuredName = cookieOptions?.name?.trim();

  return request.cookies.getAll().some(({ name }) => {
    if (configuredName) {
      return name === configuredName || name.startsWith(`${configuredName}.`);
    }

    return (
      name === 'sb-auth-token' ||
      name.endsWith('-auth-token') ||
      name.includes('-auth-token.')
    );
  });
}

/**
 * Creates a Supabase client inside Next.js middleware.
 * Refreshes session tokens and writes updated cookies to the response.
 *
 * Returns `{ supabase, response }` — caller must return `response`.
 *
 * @param cookieOptions - Override the default cookie options (e.g. custom name
 *   to isolate sessions between apps sharing the same Supabase project).
 */
export async function createMiddlewareClient(
  request: MiddlewareRequest,
  cookieOptions?: CookieOptionsWithName,
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables',
    );
  }

  // Start with a NextResponse that forwards the original request headers
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: cookieOptions ?? getCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Set cookies on the request (for downstream Server Components)
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        // Re-create response so downstream can read updated cookies
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        // Set cookies on the response (for the browser)
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  let user: MiddlewareAuthUser | null = null;
  let authChecked = false;
  const resolvedCookieOptions = cookieOptions ?? getCookieOptions();

  // Resolve identity only when an auth cookie is actually present.
  if (hasAuthCookie(request, resolvedCookieOptions)) {
    authChecked = true;

    if (process.env.SUPABASE_MIDDLEWARE_AUTH_MODE === 'getUser') {
      // Kill switch: legacy per-request network validation via the Auth
      // server. Set SUPABASE_MIDDLEWARE_AUTH_MODE=getUser to revert without
      // a code change.
      const {
        data: { user: resolvedUser },
      } = await supabase.auth.getUser();
      user = resolvedUser
        ? {
            id: resolvedUser.id,
            email: resolvedUser.email ?? null,
            phone: resolvedUser.phone ?? null,
            user_metadata: {
              full_name:
                typeof resolvedUser.user_metadata?.full_name === 'string'
                  ? resolvedUser.user_metadata.full_name
                  : null,
            },
            emailVerified: Boolean(resolvedUser.email_confirmed_at),
          }
        : null;
    } else {
      // getClaims() first calls getSession() — expiring tokens are still
      // refreshed and rewritten through the cookie handlers above. With
      // asymmetric JWT signing keys the JWT is verified locally against the
      // cached JWKS (no network); on the legacy HS256 shared secret it
      // transparently falls back to a getUser() network call. Trade-off:
      // revoked sessions are caught at the next token refresh or the first
      // API call (API handlers still use strict getUser()) instead of per
      // page navigation.
      const { data, error } = await supabase.auth.getClaims();
      if (!error && data?.claims?.sub) {
        user = toMiddlewareAuthUser(data.claims);
      }
    }
  }

  return { supabase, response, user, authChecked };
}
