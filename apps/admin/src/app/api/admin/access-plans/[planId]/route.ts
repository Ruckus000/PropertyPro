/**
 * Single access plan operations.
 *
 * DELETE /api/admin/access-plans/[planId] — revoke an access plan
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { z } from 'zod';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { assertNoDbError } from '@/lib/api/assert-no-db-error';
import { logAdminAction } from '@/lib/audit/log-admin-action';
import { parseAdminBody } from '@/lib/api/parse-body';

/**
 * `reason` was read as `(body as { reason?: string }).reason` with no runtime
 * check, then interpolated into `notes`. A non-string (an object, an array)
 * would stringify into the column; an unbounded string would be stored whole.
 */
const revokeSchema = z.object({
  reason: z.string().max(1000).nullish(),
});

interface RouteParams {
  params: Promise<{ planId: string }>;
}

export const DELETE = withAdminErrorHandler(async (request: NextRequest, { params }: RouteParams) => {
  const admin = await requirePlatformAdmin();
  const { planId } = await params;

  const id = Number(planId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: { message: 'Invalid plan ID' } }, { status: 400 });
  }

  const parsed = await parseAdminBody(request, revokeSchema);
  if (parsed instanceof NextResponse) return parsed;
  const reason = parsed.reason ?? null;

  const db = createAdminTypedClient();

  const updatePayload: Record<string, unknown> = {
    revoked_at: new Date().toISOString(),
    revoked_by: admin.id,
  };
  if (reason) {
    updatePayload.notes = `[Revoked] ${reason}`;
  }

  const { data, error } = await (db
    .from('access_plans'))
    .update(updatePayload)
    .eq('id', id)
    .is('revoked_at', null)
    .is('converted_at', null)
    .select()
    .single();

  assertNoDbError(error, 'Failed to revoke access plan');

  if (!data) {
    return NextResponse.json({ error: { message: 'Plan not found or already revoked/converted' } }, { status: 404 });
  }

  // Mirror the web-side service: if no other active plans remain for this
  // community, clear the denormalized free_access_expires_at column so
  // subscription-guard stops admitting writes under the revoked grant.
  const revokedRow = data as { community_id: number };
  const { data: otherPlans, error: otherErr } = await (db
    .from('access_plans'))
    .select('id')
    .eq('community_id', revokedRow.community_id)
    .is('revoked_at', null)
    .is('converted_at', null)
    .neq('id', id);

  if (otherErr) {
    console.error(
      '[admin/access-plans/revoke] Plan revoked but other-plans lookup failed:',
      otherErr.message,
    );
  } else if ((otherPlans ?? []).length === 0) {
    const { error: clearErr } = await (db
      .from('communities'))
      .update({ free_access_expires_at: null })
      .eq('id', revokedRow.community_id);

    if (clearErr) {
      console.error(
        '[admin/access-plans/revoke] Plan revoked but community clear failed:',
        clearErr.message,
      );
    }
  }

  await logAdminAction({
    admin,
    action: 'access_plan_revoked',
    resourceType: 'access_plan',
    resourceId: id,
    communityId: revokedRow.community_id,
    newValues: { revoked_at: updatePayload.revoked_at, reason },
  });

  return NextResponse.json({ plan: data });
});
