/**
 * Intervene on a deletion request (during cooling period).
 *
 * POST /api/admin/deletion-requests/[id]/intervene
 *
 * Cancels the request and every other `cooling` request of the same target
 * (the same user, or the same community), in one transaction: a duplicate left
 * cooling would delete the target when its own cooling ended. Refused (409)
 * when the target is already deleted through another request; recovering it is
 * the operator's move then. See `interveneDeletionRequestOp`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
// AUTHZ: platform-admin-only intervention (requirePlatformAdmin is the first call in POST); the op cancels only the request's own target.
import { interveneDeletionRequestOp } from '@propertypro/db/unsafe';
import { z } from 'zod';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
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

  const result = await interveneDeletionRequestOp(requestId, {
    cancelledBy: admin.id,
    notes: notes ?? `Intervened by platform admin ${admin.email}`,
  });

  if (result.outcome === 'not_found' || result.outcome === 'not_cooling') {
    return NextResponse.json({ error: { message: 'Request not found or not in cooling status' } }, { status: 404 });
  }
  if (result.outcome === 'target_deleted') {
    return NextResponse.json(
      {
        error: {
          code: 'TARGET_DELETED',
          message:
            result.request.requestType === 'community'
              ? 'This community is already deleted through another request, so cancelling this one would not keep it open. Recover the deleted request instead.'
              : 'This account is already deleted through another request, so cancelling this one would not keep it open. Recover the deleted request instead.',
        },
      },
      { status: 409 },
    );
  }

  await logAdminAction({
    admin,
    action: 'deletion_request_intervened',
    resourceType: 'account_deletion_request',
    resourceId: requestId,
    // Null for a user-type request — the case that needs a nullable column.
    communityId: result.request.communityId ?? null,
    oldValues: { status: 'cooling' },
    newValues: {
      status: 'cancelled',
      intervention_notes: notes ?? null,
      cancelled_request_ids: result.cancelledRequestIds,
    },
  });

  return NextResponse.json({ request: result.request });
});
