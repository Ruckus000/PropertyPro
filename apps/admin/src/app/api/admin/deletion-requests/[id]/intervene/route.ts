/**
 * Intervene on a deletion request (during cooling period).
 *
 * POST /api/admin/deletion-requests/[id]/intervene
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { z } from 'zod';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { assertNoDbError } from '@/lib/api/assert-no-db-error';
import { logAdminAction } from '@/lib/audit/log-admin-action';
import { parseAdminBody } from '@/lib/api/parse-body';

// This endpoint is legitimately called with NO body at all, which made the
// previous unguarded `await request.json()` throw a SyntaxError and 500.
// parseAdminBody treats an empty body as `{}`; every field here is optional.
const interveneSchema = z.object({
  notes: z.string().max(2000).nullish(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAdminErrorHandler(async (request: NextRequest, { params }: RouteParams) => {
  const admin = await requirePlatformAdmin();
  const { id } = await params;

  const requestId = Number(id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return NextResponse.json({ error: { message: 'Invalid request ID' } }, { status: 400 });
  }

  const parsed = await parseAdminBody(request, interveneSchema);
  if (parsed instanceof NextResponse) return parsed;
  const { notes } = parsed;

  const db = createAdminTypedClient();
  const cancellation = {
    status: 'cancelled' as const,
    cancelled_at: new Date().toISOString(),
    cancelled_by: admin.id,
    intervention_notes: notes ?? `Intervened by platform admin ${admin.email}`,
  };

  // maybeSingle, not single: zero rows (not found, or no longer cooling) is the
  // 404 below. `.single()` turned it into a PostgREST error and a 500.
  const { data, error } = await (db
    .from('account_deletion_requests'))
    .update(cancellation)
    .eq('id', requestId)
    .eq('status', 'cooling')
    .select()
    .maybeSingle();

  assertNoDbError(error, 'Failed to record deletion-request intervention');

  if (!data) {
    return NextResponse.json({ error: { message: 'Request not found or not in cooling status' } }, { status: 404 });
  }

  const row = data as { request_type: string; user_id: string | null; community_id: number | null };
  const cancelledRequestIds = [requestId];

  // A user can hold more than one cooling request (a duplicate). Stopping only
  // this one left the other to delete the account when its cooling ended.
  let othersFailed = false;
  if (row.request_type === 'user' && row.user_id) {
    const { data: others, error: othersError } = await (db
      .from('account_deletion_requests'))
      .update(cancellation)
      .eq('user_id', row.user_id)
      .eq('request_type', 'user')
      .eq('status', 'cooling')
      .select('id');
    othersFailed = Boolean(othersError);
    for (const other of (others ?? []) as { id: number }[]) cancelledRequestIds.push(other.id);
  }

  await logAdminAction({
    admin,
    action: 'deletion_request_intervened',
    resourceType: 'account_deletion_request',
    resourceId: requestId,
    // Null for a user-type request — the case that needs a nullable column.
    communityId: row.community_id ?? null,
    oldValues: { status: 'cooling' },
    newValues: {
      status: 'cancelled',
      intervention_notes: notes ?? null,
      cancelled_request_ids: cancelledRequestIds,
      ...(othersFailed ? { other_requests_cancel_failed: true } : {}),
    },
  });

  if (othersFailed) {
    return NextResponse.json(
      {
        error: {
          code: 'OTHER_REQUESTS_CANCEL_FAILED',
          message: 'This request was cancelled, but the user’s other pending deletion requests could not be. Intervene on those too, or the account will still be deleted.',
        },
        request: data,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ request: data });
});
