/**
 * Agent-friendly dev login — development only.
 *
 * Usage: GET /dev/agent-login?as=owner
 *
 * Authenticates via admin-generated magic link verified server-side.
 * No env vars or passwords needed by the caller — the agent only provides
 * the role name. Sets session cookies on the response so preview-tool
 * browsers are immediately authenticated.
 *
 * Content negotiation:
 *   Accept: text/html  → redirect to portal (default)
 *   Accept: application/json → JSON response with session info
 *
 * Returns 404 in production.
 */
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { getCookieOptions } from '@propertypro/db/supabase/cookie-config';
import { findUserCommunitiesUnscoped } from '@propertypro/db/unsafe';

/** Hard-coded demo emails — deterministic seed data, not secrets. */
const ROLE_EMAIL_MAP: Record<string, string> = {
  owner: 'owner.one@sunset.local',
  tenant: 'tenant.one@sunset.local',
  board_president: 'board.president@sunset.local',
  board_member: 'board.member@sunset.local',
  cam: 'cam.one@sunset.local',
  pm_admin: 'pm.admin@sunset.local',
  site_manager: 'site.manager@sunsetridge.local',
};

const ADMIN_ROLES = new Set([
  'board_president',
  'board_member',
  'cam',
  'site_manager',
  'pm_admin',
]);

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('Not Found', { status: 404 });
  }

  const url = new URL(request.url);
  const role = url.searchParams.get('as');
  const validRoles = Object.keys(ROLE_EMAIL_MAP).join(', ');

  if (!role || !(role in ROLE_EMAIL_MAP)) {
    return NextResponse.json(
      { error: `Missing or invalid "as" parameter. Valid roles: ${validRoles}` },
      { status: 400 },
    );
  }

  const email = ROLE_EMAIL_MAP[role]!;

  // Step 1: Generate a magic link via admin client (service role, server-side only)
  const admin = createAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      {
        error: 'Failed to generate login link',
        details: linkError?.message,
        hint: `Ensure "${email}" exists in Supabase Auth (run: pnpm seed:demo)`,
      },
      { status: 500 },
    );
  }

  // Step 2: Verify the OTP server-side to establish a session with cookies
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
            // May fail in some contexts; we replay onto response below
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
      {
        error: 'OTP verification failed',
        details: authError?.message,
      },
      { status: 500 },
    );
  }

  // Step 3: Resolve communities for this user
  const communities = await findUserCommunitiesUnscoped(authData.user.id);

  // Allow explicit community selection via ?communityId=X
  const rawCommunityId = url.searchParams.get('communityId');
  const requestedCommunityId = rawCommunityId ? Number(rawCommunityId) : null;

  const primary = (
    requestedCommunityId
      ? communities.find((c) => c.communityId === requestedCommunityId)
      : undefined
  ) ?? communities[0] ?? null;

  const isAdmin = ADMIN_ROLES.has(role);
  let portal = role === 'pm_admin' ? '/pm/dashboard/communities' : isAdmin ? '/dashboard' : '/mobile';
  if (primary && role !== 'pm_admin') {
    portal += `?communityId=${primary.communityId}`;
  }

  // Step 4: Respond based on Accept header
  const accept = request.headers.get('accept') ?? '';
  const wantsJson = accept.includes('application/json');

  if (wantsJson) {
    const response = NextResponse.json({
      ok: true,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        role,
      },
      community: primary
        ? {
            id: primary.communityId,
            name: primary.communityName,
            slug: primary.slug,
            type: primary.communityType,
            role: primary.role,
          }
        : null,
      allCommunities: communities.map((c) => ({
        id: c.communityId,
        name: c.communityName,
        slug: c.slug,
        type: c.communityType,
        role: c.role,
      })),
      portal,
      hint: `Session cookies are set. Navigate to ${portal} to use the app as ${role}.`,
    });

    response.headers.set('Cache-Control', 'no-store');
    for (const cookie of pendingCookies) {
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    }
    return response;
  }

  // HTML mode: redirect to portal
  const isDevelopment = process.env.NODE_ENV === 'development';
  const baseUrl = isDevelopment ? url.origin : process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const response = NextResponse.redirect(new URL(portal, baseUrl).toString());
  response.headers.set('Cache-Control', 'no-store');
  for (const cookie of pendingCookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}
