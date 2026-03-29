/**
 * Admin Supabase client with service role key.
 * For server-side admin operations ONLY — NEVER expose to the browser.
 *
 * @module supabase/admin
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AdminDatabase } from './admin-types';

let adminClient: SupabaseClient | null = null;

/**
 * Returns a singleton admin Supabase client using the service role key.
 * Bypasses RLS — use only in trusted server-side contexts.
 */
export function createAdminClient() {
  if (adminClient) return adminClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables',
    );
  }

  adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}

/**
 * Returns the admin client with typed table definitions.
 *
 * Usage: `createAdminTypedClient().from('access_plans')` — no `as any` needed.
 */
export function createAdminTypedClient(): SupabaseClient<AdminDatabase> {
  return createAdminClient() as unknown as SupabaseClient<AdminDatabase>;
}
