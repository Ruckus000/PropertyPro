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

  const { data, error } = await (db
    .from('account_deletion_requests'))
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: admin.id,
      intervention_notes: notes ?? `Intervened by platform admin ${admin.email}`,
    })
    .eq('id', requestId)
    .eq('status', 'cooling')
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: { message: 'Request not found or not in cooling status' } }, { status: 404 });
  }

  await logAdminAction({
    admin,
    action: 'deletion_request_intervened',
    resourceType: 'account_deletion_request',
    resourceId: requestId,
    // Null for a user-type request — the case that needs a nullable column.
    communityId: (data as { community_id?: number | null }).community_id ?? null,
    oldValues: { status: 'cooling' },
    newValues: { status: 'cancelled', intervention_notes: notes ?? null },
  });

  return NextResponse.json({ request: data });
});
