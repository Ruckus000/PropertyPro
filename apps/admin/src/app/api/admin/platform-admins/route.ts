/**
 * Platform admin management API.
 *
 * GET  /api/admin/platform-admins — list all platform admins with emails
 * POST /api/admin/platform-admins — add an existing user as a platform admin
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { assertNoDbError } from '@/lib/api/assert-no-db-error';
import { PLATFORM_LIST_LIMIT } from '@/lib/api/list-limits';
import { buildAuthUserMap, listAllAuthUsers } from '@/lib/auth/list-all-auth-users';
import { parseAdminBody } from '@/lib/api/parse-body';
import { logAdminAction } from '@/lib/audit/log-admin-action';

/** Row shape for platform_admin_users (not in generated Supabase types). */
interface PlatformAdminRow {
  user_id: string;
  role: string;
  invited_by: string | null;
  created_at: string;
}

/** Postgres unique_violation — the platform_admin_users primary key. */
const DUPLICATE_KEY_ERRCODE = '23505';

/** The one 409 both the pre-check and the primary key return. */
function alreadyAdminResponse() {
  return NextResponse.json(
    { error: { code: 'ALREADY_ADMIN', message: 'This user is already a platform admin.' } },
    { status: 409 },
  );
}

const addAdminSchema = z.object({
  email: z.string().email(),
});

export const GET = withAdminErrorHandler(async () => {
  await requirePlatformAdmin();

  const db = createAdminClient();

  const { data, error } = await db
    .from('platform_admin_users')
    .select('user_id, role, invited_by, created_at')
    .order('created_at')
    .limit(PLATFORM_LIST_LIMIT);

  assertNoDbError(error, 'Failed to list platform admins');

  const rows = (data ?? []) as unknown as PlatformAdminRow[];

  // Batch fetch all auth users to avoid N+1 queries. Must page: a bare
  // listUsers() returns only the first 50, so admins past that rendered as
  // 'unknown' with no error.
  const authUserMap = await buildAuthUserMap(db);

  const admins = rows.map((row) => {
    const user = authUserMap.get(row.user_id);
    return {
      userId: row.user_id,
      email: user?.email ?? 'unknown',
      role: row.role,
      invitedBy: row.invited_by,
      createdAt: row.created_at,
    };
  });

  return NextResponse.json({ admins });
});

export const POST = withAdminErrorHandler(async (request: NextRequest) => {
  const currentAdmin = await requirePlatformAdmin();

  const parsed = await parseAdminBody(request, addAdminSchema);
  if (parsed instanceof NextResponse) return parsed;

  const { email } = parsed;
  const db = createAdminClient();

  // Look up the user by email in auth.users. Paging matters here too: an
  // unpaged lookup silently misses an existing user past the first page and
  // reports 'No account found' for someone who does have one.
  const users = await listAllAuthUsers(db);
  const targetUser = users.find((u) => u.email === email);

  if (!targetUser) {
    return NextResponse.json(
      { error: { code: 'USER_NOT_FOUND', message: 'No account found with that email. The user must create an account first.' } },
      { status: 404 },
    );
  }

  // Check if already an admin
  const { data: existing } = await db
    .from('platform_admin_users')
    .select('user_id')
    .eq('user_id', targetUser.id)
    .maybeSingle();

  if (existing) {
    return alreadyAdminResponse();
  }

  // Insert as platform admin — use rpc or raw insert since table is not in generated types
  const { error: insertError } = await db
    .from('platform_admin_users')
    .insert({
      user_id: targetUser.id,
      role: 'super_admin',
      invited_by: currentAdmin.id,
    } as never);

  // A concurrent grant of the same user won the race between the check above
  // and this insert. The primary key already prevented the duplicate, so
  // nothing is at risk — this only stops a correctly-refused request from
  // surfacing as an opaque 500 and paging someone.
  if (insertError?.code === DUPLICATE_KEY_ERRCODE) {
    return alreadyAdminResponse();
  }

  assertNoDbError(insertError, 'Failed to add platform admin');

  await logAdminAction({
    admin: currentAdmin,
    action: 'platform_admin_added',
    resourceType: 'platform_admin_user',
    resourceId: targetUser.id,
    // Platform-level: no community.
    newValues: { user_id: targetUser.id, role: 'super_admin', invited_by: currentAdmin.id },
    metadata: { granted_to_email: email },
  });

  return NextResponse.json({
    admin: {
      userId: targetUser.id,
      email: targetUser.email,
      role: 'super_admin',
      invitedBy: currentAdmin.id,
      createdAt: new Date().toISOString(),
    },
  }, { status: 201 });
});
