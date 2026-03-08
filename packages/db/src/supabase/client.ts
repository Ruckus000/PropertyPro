/**
 * Browser Supabase client for Client Components.
 * Uses singleton pattern — created once, reused across renders.
 *
 * @module supabase/client
 */
import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr';
import { getCookieOptions } from './cookie-config';

let client: ReturnType<typeof createSupabaseBrowserClient> | null = null;

/**
 * Returns a singleton Supabase browser client for use in Client Components.
 * Reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from env.
 */
export function createBrowserClient() {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables',
    );
  }

  client = createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: getCookieOptions(),
  });
  return client;
}
