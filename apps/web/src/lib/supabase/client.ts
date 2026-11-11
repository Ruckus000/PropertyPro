/**
 * App-level re-export of the Supabase browser client.
 *
 * Singleton — safe to call multiple times in Client Components.
 * Listens for auth state changes and handles token refresh automatically.
 *
 * `getSafeAuthErrorMessage` is re-exported here, not imported on its own, so a
 * page that loads this module lazily (the login form) gets it from the same
 * chunk as the client rather than through a second import of supabase-js.
 *
 * Usage in Client Components:
 *   'use client';
 *   const supabase = createBrowserClient();
 *   supabase.auth.onAuthStateChange((event, session) => { ... });
 */
export { createBrowserClient } from '@propertypro/db/supabase/client';
export { getSafeAuthErrorMessage } from '@propertypro/db/supabase/auth-error';
