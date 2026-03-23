/**
 * Intervene on a deletion request (during cooling period).
 *
 * POST /api/admin/deletion-requests/[id]/intervene
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const admin = await requirePlatformAdmin();
  const { id } = await params;

  const requestId = Number(id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return NextResponse.json({ error: { message: 'Invalid request ID' } }, { status: 400 });
  }

  const body = await request.json();
  const { notes } = body as { notes?: string };

  const db = createAdminClient();

  const { data, error } = await (db
    .from('account_deletion_requests') as AnyQuery)
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

  return NextResponse.json({ request: data });
}
