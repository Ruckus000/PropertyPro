/**
 * Single platform admin API.
 *
 * DELETE /api/admin/platform-admins/:userId — remove a platform admin
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { assertNoDbError } from '@/lib/api/assert-no-db-error';
import { logAdminAction } from '@/lib/audit/log-admin-action';

/**
 * The platform must never be left with zero admins — nobody could then grant
 * admin back, because granting requires an admin session.
 *
 * NOT AUTHORITATIVE. The real floor is the `pp_enforce_platform_admin_floor`
 * BEFORE DELETE trigger (migration 0056), which is the only place that can
 * enforce it atomically. This constant is a UX fast-path: it produces a useful
 * message without a failed write. Raising it here does NOT raise the floor —
 * change the trigger too, or the UI will refuse at a threshold the database
 * still permits.
 */
const MIN_PLATFORM_ADMINS = 1;

/** Raised by the 0056 floor trigger. */
const FLOOR_TRIGGER_ERRCODE = '23514'; // check_violation

/** The one 409 both the pre-check and the floor trigger return. */
function lastAdminResponse() {
  return NextResponse.json(
    {
      error: {
        code: 'LAST_ADMIN',
        message:
          'Cannot remove the last platform admin. Grant admin to another account first.',
      },
    },
    { status: 409 },
  );
}

export const DELETE = withAdminErrorHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) => {
  const currentAdmin = await requirePlatformAdmin();
  const { userId } = await params;

  if (userId === currentAdmin.id) {
    return NextResponse.json(
      { error: { code: 'SELF_DELETE', message: 'You cannot remove yourself as a platform admin.' } },
      { status: 400 },
    );
  }

  const db = createAdminClient();

  const { data: existing } = await db
    .from('platform_admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Admin not found.' } },
      { status: 404 },
    );
  }

  // Last-admin floor.
  //
  // Note honestly what this does and does not buy: the SELF_DELETE guard above
  // already means the acting admin survives any single sequential delete, so in
  // the ordinary case this is a backstop rather than the primary control. It
  // matters in two situations that are real —
  //
  //  1. Concurrent removals. Two admins removing each other at the same time
  //     each pass their own check and the pair can reach zero. This count
  //     narrows that window but does NOT close it: PostgREST gives no
  //     transaction here, so the count and the delete are separate statements.
  //     Closing it properly needs a BEFORE DELETE trigger taking `FOR UPDATE`
  //     over the table, which is tracked as follow-up rather than bundled into
  //     this phase's migration.
  //  2. Any future change that relaxes or removes the SELF_DELETE guard, at
  //     which point this becomes the only thing standing between an operator
  //     and a permanently locked-out platform.
  const { count, error: countError } = await db
    .from('platform_admin_users')
    .select('user_id', { count: 'exact', head: true });

  if (countError) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Could not verify remaining platform admins.' } },
      { status: 500 },
    );
  }

  // Fail closed on an absent count rather than assuming the floor is satisfied.
  if (count === null || count - 1 < MIN_PLATFORM_ADMINS) {
    return lastAdminResponse();
  }

  const { error } = await db
    .from('platform_admin_users')
    .delete()
    .eq('user_id', userId);

  // The floor trigger fired, so this delete lost a race with a concurrent one
  // that the count above could not see. Same answer as the check, deliberately:
  // to the caller a caught race and a lost race are the same outcome, and
  // routing it through assertNoDbError instead would return an opaque 500 and
  // page someone for a correctly-refused request.
  if (error?.code === FLOOR_TRIGGER_ERRCODE) {
    return lastAdminResponse();
  }

  assertNoDbError(error, 'Failed to remove platform admin');

  await logAdminAction({
    admin: currentAdmin,
    action: 'platform_admin_removed',
    resourceType: 'platform_admin_user',
    resourceId: userId,
    // Platform-level: no community. This is precisely the case that no
    // existing audit table could represent.
    oldValues: { user_id: userId, role: 'super_admin' },
    metadata: { remaining_admins: count - 1 },
  });

  return NextResponse.json({ success: true });
});
