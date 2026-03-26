/**
 * Deletion Requests API for the admin console.
 *
 * GET /api/admin/deletion-requests — list all deletion requests
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getDeletionRequestsData } from '@/lib/server/deletion-requests';

export async function GET(request: NextRequest) {
  await requirePlatformAdmin();

  const status = request.nextUrl.searchParams.get('status');
  const type = request.nextUrl.searchParams.get('type');

  try {
    const data = await getDeletionRequestsData({ status, type });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load deletion requests';
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
