/**
 * Extend an access plan.
 *
 * POST /api/admin/access-plans/[planId]/extend — add months to a plan
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
 * `additionalMonths` previously had no integer check (1.5 silently truncated
 * inside setMonth) and no upper bound, so a single call could extend a free
 * grant effectively forever. Same money-decision reasoning as the grant route.
 */
const extendSchema = z.object({
  additionalMonths: z.number().int().min(1).max(24),
  notes: z.string().max(2000).nullish(),
});

interface RouteParams {
  params: Promise<{ planId: string }>;
}

export const POST = withAdminErrorHandler(async (request: NextRequest, { params }: RouteParams) => {
  const admin = await requirePlatformAdmin();
  const { planId } = await params;

  const id = Number(planId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: { message: 'Invalid plan ID' } }, { status: 400 });
  }

  const parsed = await parseAdminBody(request, extendSchema);
  if (parsed instanceof NextResponse) return parsed;
  const { additionalMonths, notes } = parsed;

  const db = createAdminTypedClient();

  // Fetch current plan
  const { data: plan, error: fetchError } = await (db
    .from('access_plans'))
    .select('*')
    .eq('id', id)
    .is('revoked_at', null)
    .is('converted_at', null)
    .single();

  if (fetchError || !plan) {
    return NextResponse.json({ error: { message: 'Plan not found or already revoked/converted' } }, { status: 404 });
  }

  const planRow = plan as {
    expires_at: string;
    grace_ends_at: string;
    duration_months: number;
    grace_period_days: number;
    notes: string | null;
  };

  // Extend: add months to current expires_at, recalculate grace_ends_at
  const newExpires = new Date(planRow.expires_at);
  newExpires.setMonth(newExpires.getMonth() + additionalMonths);

  const newGraceEnds = new Date(newExpires);
  newGraceEnds.setDate(newGraceEnds.getDate() + planRow.grace_period_days);

  const existingNotes = planRow.notes ?? '';
  const extensionNote = notes
    ? `[Extended +${additionalMonths}mo] ${notes}`
    : `[Extended +${additionalMonths}mo]`;
  const updatedNotes = existingNotes
    ? `${existingNotes}\n${extensionNote}`
    : extensionNote;

  const { data: updated, error: updateError } = await (db
    .from('access_plans'))
    .update({
      expires_at: newExpires.toISOString(),
      grace_ends_at: newGraceEnds.toISOString(),
      duration_months: planRow.duration_months + additionalMonths,
      notes: updatedNotes,
    })
    .eq('id', id)
    .select()
    .single();

  assertNoDbError(updateError, 'Failed to extend access plan');

  // Refresh the denormalized free_access_expires_at on the community so
  // subscription-guard sees the new grace window. Best-effort follow-up
  // write (non-fatal if it fails — logged for observability).
  const updatedRow = updated as { community_id: number };
  const { error: communityUpdateError } = await (db
    .from('communities'))
    .update({ free_access_expires_at: newGraceEnds.toISOString() })
    .eq('id', updatedRow.community_id);

  if (communityUpdateError) {
    console.error(
      '[admin/access-plans/extend] Plan extended but community.free_access_expires_at update failed:',
      communityUpdateError.message,
    );
  }

  await logAdminAction({
    admin,
    action: 'access_plan_extended',
    resourceType: 'access_plan',
    resourceId: id,
    communityId: updatedRow.community_id,
    oldValues: {
      expires_at: planRow.expires_at,
      duration_months: planRow.duration_months,
    },
    newValues: {
      expires_at: newExpires.toISOString(),
      grace_ends_at: newGraceEnds.toISOString(),
      duration_months: planRow.duration_months + additionalMonths,
      additional_months: additionalMonths,
      notes: notes ?? null,
    },
  });

  return NextResponse.json({ plan: updated });
});
