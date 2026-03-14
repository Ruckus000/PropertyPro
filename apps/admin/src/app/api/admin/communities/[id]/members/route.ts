/**
 * Community members API for the admin platform.
 *
 * GET /api/admin/communities/:id/members — list all members with roles
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface UserRoleRow {
  id: number;
  user_id: string;
  role: string;
  preset_key: string | null;
  display_title: string | null;
  is_unit_owner: boolean;
  created_at: string;
  updated_at: string;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  await requirePlatformAdmin();

  const { id } = await context.params;
  const communityId = Number(id);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_ID', message: 'Invalid community ID' } },
      { status: 400 },
    );
  }

  const db = createAdminClient();

  // Verify community exists and is not a demo
  const { data: community } = await db
    .from('communities')
    .select('id, is_demo')
    .eq('id', communityId)
    .is('deleted_at', null)
    .single();

  if (!community || (community as Record<string, unknown>).is_demo) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Community not found' } },
      { status: 404 },
    );
  }

  // Fetch user roles for this community
  const { data: roles, error } = await db
    .from('user_roles')
    .select('id, user_id, role, preset_key, display_title, is_unit_owner, created_at, updated_at')
    .eq('community_id', communityId)
    .order('created_at');

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message } },
      { status: 500 },
    );
  }

  const rows = (roles ?? []) as unknown as UserRoleRow[];

  // Resolve user details from auth.users and users table
  const members = await Promise.all(
    rows.map(async (row) => {
      const [authResult, profileResult] = await Promise.all([
        db.auth.admin.getUserById(row.user_id),
        db.from('users').select('full_name, email, phone').eq('id', row.user_id).maybeSingle(),
      ]);

      const authUser = authResult.data?.user;
      const profile = profileResult.data as { full_name: string | null; email: string | null; phone: string | null } | null;

      return {
        roleId: row.id,
        userId: row.user_id,
        email: profile?.email ?? authUser?.email ?? 'unknown',
        fullName: profile?.full_name ?? null,
        phone: profile?.phone ?? null,
        role: row.role,
        presetKey: row.preset_key,
        displayTitle: row.display_title,
        isUnitOwner: row.is_unit_owner,
        lastSignInAt: authUser?.last_sign_in_at ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }),
  );

  return NextResponse.json({ members });
}
