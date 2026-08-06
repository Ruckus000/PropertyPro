/**
 * Agent-friendly dev login for the admin app — development only.
 *
 * Usage: GET /dev/agent-login?as=platform_admin   (alias: ?as=pm_admin)
 *
 * Authenticates via admin-generated magic link verified server-side.
 * Sets session cookies so preview-tool browsers are immediately authenticated.
 *
 * Returns 404 in production.
 *
 * ## Why this route provisions its own identity
 *
 * Every admin route is gated by `middleware.ts` on a `platform_admin_users` row.
 * **Nothing seeds that table** — `pnpm seed:demo` leaves it at 0 rows — so before
 * this change the route minted a session that the middleware then immediately
 * rejected with `?error=access_denied`. It granted the session but not the grant
 * that makes a session useful, which made `support-access.spec.ts` (and any
 * future admin-app spec) impossible to pass.
 *
 * The fix deliberately does NOT go in the seed. Seeding a `super_admin` would put
 * platform-wide privilege into shared demo data that is used for real demos. So
 * instead this route — which already 404s outside development, already holds the
 * service-role client, and is already the privilege-granting surface — creates
 * and reuses a **dedicated identity** on demand:
 *
 *   - `pnpm seed:demo` output is unchanged; `select * from platform_admin_users`
 *     is still 0 rows on a freshly seeded database.
 *   - The privileged identity is NOT a demo persona. `pm.admin@sunset.local` is a
 *     PM-company admin shown in demos and never receives platform privilege here,
 *     so no demo can surface a super_admin.
 *   - There is no extra script for an e2e job to forget to run.
 *
 * The row is created only on a dev-only route that returns 404 whenever
 * `NODE_ENV !== 'development'`, i.e. the same blast radius that already applies to
 * this route minting sessions at all.
 */
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { ADMIN_COOKIE_OPTIONS } from '@/lib/auth/cookie-config';

/**
 * Dedicated dev/e2e platform-admin identity. Deliberately NOT a demo persona and
 * deliberately not seeded — provisioned on demand by this dev-only route. The
 * `.local` TLD is reserved and unroutable, so this address cannot receive mail.
 */
const ADMIN_EMAIL = 'e2e.platform.admin@local';

/** Accepted `?as=` values. `pm_admin` retained so existing callers keep working. */
const VALID_ROLES = new Set(['platform_admin', 'pm_admin']);

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('Not Found', { status: 404 });
  }

  const url = new URL(request.url);
  const role = url.searchParams.get('as');

  if (!role || !VALID_ROLES.has(role)) {
    return NextResponse.json(
      { error: 'Missing or invalid "as" parameter. Valid: platform_admin' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Step 0: Create the dedicated identity if it does not exist yet.
  // `email_confirm` is required or the generated magic link cannot be verified.
  // A duplicate is the normal steady state (every run after the first), so an
  // "already registered" failure is expected and non-fatal — the id we actually
  // use comes from `verifyOtp` below, not from here.
  const { error: createError } = await admin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    email_confirm: true,
  });

  if (createError && !/already|exist|registered|duplicate/i.test(createError.message)) {
    return NextResponse.json(
      {
        error: 'Failed to provision the dev platform-admin identity',
        details: createError.message,
      },
      { status: 500 },
    );
  }

  // Step 1: Generate a magic link via admin client (service role)
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: ADMIN_EMAIL,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      {
        error: 'Failed to generate login link',
        details: linkError?.message,
        hint: `Could not generate a link for "${ADMIN_EMAIL}". Check that Supabase Auth is running.`,
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

  // Step 2.5: Grant platform admin. Without this row `middleware.ts` bounces the
  // session we just minted to /auth/login?error=access_denied. Upsert so repeat
  // logins are idempotent; the id comes from the verified session, so we never
  // have to look the user up by email.
  const { error: grantError } = await admin
    .from('platform_admin_users')
    .upsert({ user_id: authData.user.id, role: 'super_admin' }, { onConflict: 'user_id' });

  if (grantError) {
    return NextResponse.json(
      {
        error: 'Failed to grant platform admin',
        details: grantError.message,
        hint: 'Ensure migrations have been applied to the local database.',
      },
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
