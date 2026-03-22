/**
 * Shared demo session helper.
 *
 * Creates an authenticated Supabase session for a demo user by generating
 * a magic link and verifying the OTP server-side. Used by:
 * - /api/v1/auth/demo-login (public demo auto-auth)
 * - (future) demo lifecycle / conversion flows
 */
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { getCookieOptions } from '@propertypro/db/supabase/cookie-config';

export type DemoSessionCookie = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

export type DemoSessionResult =
  | { ok: true; cookies: DemoSessionCookie[] }
  | { ok: false; error: string };

/**
 * Create an authenticated Supabase session for the given email.
 *
 * Generates a magic link via the admin API, then verifies the OTP
 * server-side so session cookies are established without user interaction.
 */
export async function createDemoSession(email: string): Promise<DemoSessionResult> {
  // 1. Generate magic link
  const admin = createAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('[demo-session] Failed to generate magic link:', linkError?.message);
    return { ok: false, error: 'session_error' };
  }

  // 2. Verify OTP server-side to establish session cookies
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[demo-session] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return { ok: false, error: 'session_error' };
  }

  const cookieStore = await cookies();
  const pendingCookies: DemoSessionCookie[] = [];

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: getCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          pendingCookies.push(cookie);
          try {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          } catch {
            // May fail in some contexts; caller replays onto response
          }
        }
      },
    },
  });

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });

  if (verifyError) {
    console.error('[demo-session] OTP verification failed:', verifyError.message);
    return { ok: false, error: 'session_error' };
  }

  return { ok: true, cookies: pendingCookies };
}
