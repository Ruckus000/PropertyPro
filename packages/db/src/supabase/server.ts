/**
 * Server Supabase client for Server Components.
 * Creates a new client per request — reads cookies from request headers.
 *
 * AGENTS #1: Session is not available directly in Server Components.
 * Must use @supabase/ssr and read cookies from request headers.
 *
 * @module supabase/server
 */
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Creates a Supabase server client that reads auth from cookies.
 * Must be called per-request (async — awaits cookie store).
 */
export async function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables',
    );
  }

  const cookieStore = await cookies();

  return createSupabaseServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // setAll is called from a Server Component where cookies can't be set.
          // This is expected when the middleware handles refresh.
        }
      },
    },
  });
}
