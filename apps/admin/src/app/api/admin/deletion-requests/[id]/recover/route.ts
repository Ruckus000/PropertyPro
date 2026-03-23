/**
 * Recover a soft-deleted account/community.
 *
 * POST /api/admin/deletion-requests/[id]/recover
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  await requirePlatformAdmin();
  const { id } = await params;

  const requestId = Number(id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return NextResponse.json({ error: { message: 'Invalid request ID' } }, { status: 400 });
  }

  const db = createAdminClient();

  const { data, error } = await (db
    .from('account_deletion_requests') as AnyQuery)
    .update({
      status: 'recovered',
      recovered_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'soft_deleted')
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: { message: 'Request not found or not in soft_deleted status' } }, { status: 404 });
  }

  return NextResponse.json({ request: data });
}
