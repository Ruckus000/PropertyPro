/**
 * App-level re-export of the Supabase browser client.
 *
 * Singleton — safe to call multiple times in Client Components.
 * Listens for auth state changes and handles token refresh automatically.
 *
 * Usage in Client Components:
 *   'use client';
 *   const supabase = createBrowserClient();
 *   supabase.auth.onAuthStateChange((event, session) => { ... });
 */
export { createBrowserClient } from '@propertypro/db/supabase/client';
