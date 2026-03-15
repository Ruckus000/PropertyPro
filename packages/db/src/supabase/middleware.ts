/**
 * Middleware-specific Supabase client.
 * Can read AND write cookies to refresh the session without blocking rendering.
 *
 * @module supabase/middleware
 */
import { createServerClient, type CookieOptionsWithName } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { getCookieOptions } from './cookie-config';

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
  request: NextRequest,
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

  // Refresh the session — this silently refreshes expired tokens
  await supabase.auth.getUser();

  return { supabase, response };
}
