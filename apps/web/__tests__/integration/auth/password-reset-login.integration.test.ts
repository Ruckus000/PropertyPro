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
    const oldClient = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const oldAttempt = await oldClient.auth.signInWithPassword({ email, password: OLD_PASSWORD });
    expect(oldAttempt.error).not.toBeNull();
    expect(oldAttempt.data.session).toBeNull();

    const newClient = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const newAttempt = await newClient.auth.signInWithPassword({ email, password: NEW_PASSWORD });
    expect(newAttempt.error).toBeNull();
    expect(newAttempt.data.session).not.toBeNull();
    expect(newAttempt.data.user?.email).toBe(email);
  });

  // Exercises Supabase's recovery-session SDK contract end-to-end: generate
  // a recovery link, exchange its token for a live session, rotate the
  // password on that session, and sign in with the new password. The
  // admin-driven test above only proves admin-API password rotation; this
  // one proves that a recovery-session client can rotate a password and the
  // result is usable on a fresh sign-in.
  //
  // Note on fidelity: this uses the anon-key Supabase client (session in
  // memory). Production runs the final `updateUser` call via `updatePassword()`
  // in apps/web/src/lib/auth/password-reset.ts, which uses a server-side
  // client that reads the session from the HTTP cookie jar. This test does
  // NOT exercise the cookie-transport path — that would need a real browser
  // or Playwright. It verifies the Supabase contract that `updatePassword()`
  // depends on.
  it('updates password via a real recovery session and accepts the new password on sign-in', async () => {
    if (!admin || !userId) throw new Error('Supabase auth test setup did not complete');

    const ROTATED_PASSWORD = 'Rotated!789';

    // 1. Generate a deterministic recovery link via the admin API — same
    //    signal Supabase emits when the user clicks the email, minus the
    //    mail delivery step.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
    });
    expect(linkError).toBeNull();
    const hashedToken = linkData?.properties?.hashed_token;
    expect(hashedToken).toBeTruthy();

    // 2. Exchange the hashed token for a live recovery session on a fresh
    //    client. `verifyOtp` with `type: 'recovery'` is the programmatic
    //    equivalent of the browser client picking up the session after the
    //    email-link redirect completes.
    const recoveryClient = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: verifyData, error: verifyError } = await recoveryClient.auth.verifyOtp({
      token_hash: hashedToken!,
      type: 'recovery',
    });
    expect(verifyError).toBeNull();
    expect(verifyData.session).not.toBeNull();

    // 3. Update the password via the recovery-session client. This mirrors
    //    what `updatePassword()` in apps/web/src/lib/auth/password-reset.ts
    //    does with the server-side client.
    const { error: updateError } = await recoveryClient.auth.updateUser({
      password: ROTATED_PASSWORD,
    });
    expect(updateError).toBeNull();

    // 4. Sign out the recovery session so the subsequent sign-in is clean.
    await recoveryClient.auth.signOut();

    // 5. Fresh sign-in with the rotated password must succeed.
    const loginClient = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const loginResult = await loginClient.auth.signInWithPassword({
      email,
      password: ROTATED_PASSWORD,
    });
    expect(loginResult.error).toBeNull();
    expect(loginResult.data.session).not.toBeNull();
    expect(loginResult.data.user?.email).toBe(email);
  });
});
