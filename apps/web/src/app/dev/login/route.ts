/**
 * Dev auto-login shortcut — development only.
 *
 * Usage: GET /dev/login?as=owner
 *
 * Creates a Supabase session via admin magic-link and redirects to
 * the appropriate portal. Returns 404 in production.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { findUserCommunitiesUnscoped } from '@propertypro/db/unsafe';

const ROLE_ENV_MAP: Record<string, string> = {
  owner: 'DEV_LOGIN_OWNER_EMAIL',
  tenant: 'DEV_LOGIN_TENANT_EMAIL',
  board_president: 'DEV_LOGIN_BOARD_PRESIDENT_EMAIL',
  board_member: 'DEV_LOGIN_BOARD_MEMBER_EMAIL',
  cam: 'DEV_LOGIN_CAM_EMAIL',
  pm_admin: 'DEV_LOGIN_PM_ADMIN_EMAIL',
  site_manager: 'DEV_LOGIN_SITE_MANAGER_EMAIL',
};

const ADMIN_ROLES = new Set([
  'board_president',
  'board_member',
  'cam',
  'site_manager',
  'pm_admin',
]);

export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not Found', { status: 404 });
  }

  const url = new URL(request.url);
  const role = url.searchParams.get('as');
  const validRoles = Object.keys(ROLE_ENV_MAP).join(', ');

  if (!role || !(role in ROLE_ENV_MAP)) {
    return NextResponse.json(
      { error: `Missing or invalid "as" parameter. Valid roles: ${validRoles}` },
      { status: 400 },
    );
  }

  const envVar = ROLE_ENV_MAP[role]!;
  const email = process.env[envVar];

  if (!email) {
    return NextResponse.json(
      { error: `${envVar} environment variable is not set` },
      { status: 500 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  let redirectPath = ADMIN_ROLES.has(role) ? '/dashboard' : '/mobile';
  const redirectTo = new URL(redirectPath, baseUrl).toString();

  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  });

  if (error || !data?.properties?.action_link) {
    return NextResponse.json(
      {
        error: 'Failed to generate login link',
        details: error?.message,
        hint: `Ensure the user "${email}" exists in Supabase Auth (run: pnpm seed:demo)`,
      },
      { status: 500 },
    );
  }

  // For non-admin roles that redirect to /mobile, resolve communityId
  if (!ADMIN_ROLES.has(role)) {
    const userId = data.user?.id;
    if (userId) {
      const communities = await findUserCommunitiesUnscoped(userId);
      const first = communities[0];
      if (first) {
        redirectPath = `${redirectPath}?communityId=${first.communityId}`;
      }
    }
  }

  // Rewrite the action_link's redirect_to with the resolved path (including communityId)
  const actionUrl = new URL(data.properties.action_link);
  actionUrl.searchParams.set('redirect_to', new URL(redirectPath, baseUrl).toString());

  const response = NextResponse.redirect(actionUrl.toString());
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
