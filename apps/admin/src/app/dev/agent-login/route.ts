/**
 * Agent-friendly dev login for the admin app — development only.
 *
 * Usage: GET /dev/agent-login?as=pm_admin
 *
 * Authenticates via admin-generated magic link verified server-side.
 * Sets session cookies so preview-tool browsers are immediately authenticated.
 *
 * Returns 404 in production.
 */
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { ADMIN_COOKIE_OPTIONS } from '@/lib/auth/cookie-config';

/** Hard-coded demo email — deterministic seed data, not a secret. */
const ADMIN_EMAIL = 'pm.admin@sunset.local';

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('Not Found', { status: 404 });
  }

  const url = new URL(request.url);
  const role = url.searchParams.get('as');

  if (!role || role !== 'pm_admin') {
    return NextResponse.json(
      { error: 'Missing or invalid "as" parameter. Valid: pm_admin' },
      { status: 400 },
    );
  }

  // Step 1: Generate a magic link via admin client (service role)
  const admin = createAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: ADMIN_EMAIL,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      {
        error: 'Failed to generate login link',
        details: linkError?.message,
        hint: `Ensure "${ADMIN_EMAIL}" exists in Supabase Auth (run: pnpm seed:demo)`,
      },
      { status: 500 },
    );
  }

  // Step 2: Verify OTP server-side to set session cookies
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY' },
      { status: 500 },
    );
  }

  const cookieStore = await cookies();
  const pendingCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> =
    [];

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: ADMIN_COOKIE_OPTIONS,
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
            // Replay onto response below
          }
        }
      },
    },
  });

  const { data: authData, error: authError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: 'OTP verification failed', details: authError?.message },
      { status: 500 },
    );
  }

  // Step 3: Redirect to clients list (admin dashboard)
  const response = NextResponse.redirect(new URL('/clients', request.url));
  response.headers.set('Cache-Control', 'no-store');
  for (const cookie of pendingCookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}
