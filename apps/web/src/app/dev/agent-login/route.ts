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
// AUTHZ: Dev agent-login — password-based login for agents (dev-only, 404 in production)
import { findUserCommunitiesUnscoped } from '@propertypro/db/unsafe';

/** Hard-coded demo emails — deterministic seed data, not secrets. */
const ROLE_EMAIL_MAP: Record<string, string> = {
  owner: 'owner.one@sunset.local',
  tenant: 'tenant.one@sunset.local',
  board_president: 'board.president@sunset.local',
  board_member: 'board.member@sunset.local',
  cam: 'cam.one@sunset.local',
  pm_admin: 'pm.admin@sunset.local',
  founding_admin: 'founding.admin@palm.local',
  site_manager: 'site.manager@sunsetridge.local',
  // Root managers for the two communities that previously had none. Needed to
  // exercise root-exclusive surfaces (billing, community deletion, role
  // assignment) in Sunset Condos and Sunset Ridge — `founding_admin` only
  // covers Palm Shores.
  root_sunset: 'root.manager@sunset.local',
  root_sunsetridge: 'root.manager@sunsetridge.local',
};

const ADMIN_ROLES = new Set([
  'board_president',
  'board_member',
  'cam',
  'site_manager',
  'pm_admin',
]);

/**
 * Personas that hold `root_manager` in exactly ONE community. They land on the
 * community dashboard rather than the PM portfolio.
 */
const COMMUNITY_ROOT_PERSONAS = new Set([
  'founding_admin',
  'root_sunset',
  'root_sunsetridge',
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
    // Dev-only route (404s outside development), so this logging is bounded.
    // Without it the failure is invisible: the E2E helper is the only caller
    // that ever sees the body, and until 2026-08-05 it discarded it.
    console.error(
      `[agent-login] generateLink failed for role=${role} (${email}):`,
      linkError?.message ?? 'no hashed_token in response',
    );
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
    console.error(
      `[agent-login] verifyOtp failed for role=${role} (${email}):`,
      authError?.message ?? 'no user in response',
    );
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
  // PM-tier users (property_manager / root_manager) land on the PM portfolio
  // dashboard. The `?as=pm_admin` alias resolves to a property_manager demo row.
  // The single-community root personas stay on the community dashboard — a
  // portfolio view is meaningless for them, and the root-exclusive surfaces
  // they exist to exercise (billing, deletion, role assignment) all live there.
  const isCommunityRootPersona = COMMUNITY_ROOT_PERSONAS.has(role);
  const isPmTier =
    !isCommunityRootPersona
    && (
      role === 'pm_admin'
      || primary?.role === 'property_manager'
      || primary?.role === 'root_manager'
    );
  let portal = isPmTier
    ? '/pm/dashboard/communities'
    : (isAdmin || isCommunityRootPersona) ? '/dashboard' : '/mobile';
  if (primary && !isPmTier) {
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
