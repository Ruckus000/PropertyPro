/**
 * Extend an access plan.
 *
 * POST /api/admin/access-plans/[planId]/extend — add months to a plan
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

interface RouteParams {
  params: Promise<{ planId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  await requirePlatformAdmin();
  const { planId } = await params;

  const id = Number(planId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: { message: 'Invalid plan ID' } }, { status: 400 });
  }

  const body = await request.json();
  const { additionalMonths, notes } = body as {
    additionalMonths: number;
    notes?: string | null;
  };

  if (!additionalMonths || additionalMonths < 1) {
    return NextResponse.json({ error: { message: 'additionalMonths is required and must be >= 1' } }, { status: 400 });
  }

  const db = createAdminClient();

  // Fetch current plan
  const { data: plan, error: fetchError } = await (db
    .from('access_plans') as AnyQuery)
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
    .from('access_plans') as AnyQuery)
    .update({
      expires_at: newExpires.toISOString(),
      grace_ends_at: newGraceEnds.toISOString(),
      duration_months: planRow.duration_months + additionalMonths,
      notes: updatedNotes,
    })
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: { message: updateError.message } }, { status: 500 });
  }

  return NextResponse.json({ plan: updated });
}
