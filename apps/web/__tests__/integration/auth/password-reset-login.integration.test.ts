/**
 * Integration test: password reset → sign-in round-trip.
 *
 * Uses the Supabase admin client to provision a test user, rotate the password
 * via admin.updateUserById (same operation the reset flow ultimately performs
 * server-side), then asserts that:
 *   - sign-in with the OLD password fails
 *   - sign-in with the NEW password succeeds
 *
 * Runs only when NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are
 * present (loaded via scripts/with-env-local.sh).
 */
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabaseAuth = !!supabaseUrl && !!supabaseAnonKey && !!serviceRoleKey;

const describeSupabase = hasSupabaseAuth ? describe : describe.skip;

describeSupabase('password reset → sign-in', () => {
  const email = `pw-reset-${randomUUID().slice(0, 8)}@example.test`;
  const OLD_PASSWORD = 'OldSecret!123';
  const NEW_PASSWORD = 'BrandNew!456';

  let userId: string | null = null;
  let admin: ReturnType<typeof createClient> | null = null;

  beforeAll(async () => {
    if (!hasSupabaseAuth) return;

    admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: OLD_PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`Failed to create test user: ${error?.message ?? 'no user returned'}`);
    }
    userId = data.user.id;
  });

  afterAll(async () => {
    if (admin && userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it('rejects old password and accepts new password after admin-driven rotation', async () => {
    if (!admin || !userId) throw new Error('Supabase auth test setup did not complete');

    // Rotate password via admin API — equivalent to what updatePassword() does
    // against an authenticated recovery session on the server side.
    const updateResult = await admin.auth.admin.updateUserById(userId, {
      password: NEW_PASSWORD,
    });
    expect(updateResult.error).toBeNull();

    // Use fresh, non-persistent clients per assertion to avoid stale session state.
    const oldClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const oldAttempt = await oldClient.auth.signInWithPassword({ email, password: OLD_PASSWORD });
    expect(oldAttempt.error).not.toBeNull();
    expect(oldAttempt.data.session).toBeNull();

    const newClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const newAttempt = await newClient.auth.signInWithPassword({ email, password: NEW_PASSWORD });
    expect(newAttempt.error).toBeNull();
    expect(newAttempt.data.session).not.toBeNull();
    expect(newAttempt.data.user?.email).toBe(email);
  });
});
