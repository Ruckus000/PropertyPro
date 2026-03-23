/**
 * Single access plan operations.
 *
 * DELETE /api/admin/access-plans/[planId] — revoke an access plan
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

interface RouteParams {
  params: Promise<{ planId: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const admin = await requirePlatformAdmin();
  const { planId } = await params;

  const id = Number(planId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: { message: 'Invalid plan ID' } }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const reason = (body as { reason?: string }).reason ?? null;

  const db = createAdminClient();

  const updatePayload: Record<string, unknown> = {
    revoked_at: new Date().toISOString(),
    revoked_by: admin.id,
  };
  if (reason) {
    updatePayload.notes = `[Revoked] ${reason}`;
  }

  const { data, error } = await (db
    .from('access_plans') as AnyQuery)
    .update(updatePayload)
    .eq('id', id)
    .is('revoked_at', null)
    .is('converted_at', null)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: { message: 'Plan not found or already revoked/converted' } }, { status: 404 });
  }

  return NextResponse.json({ plan: data });
}
