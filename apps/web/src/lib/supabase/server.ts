/**
 * App-level re-export of the Supabase server client.
 *
 * AGENTS #1: Session is NOT available directly in Server Components.
 * Must use the cookie-reading server client pattern from @supabase/ssr.
 *
 * Usage in Server Components:
 *   const supabase = await createServerClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 */
export { createServerClient } from '@propertypro/db/supabase/server';
