/**
 * Deletion Requests API for the admin console.
 *
 * GET /api/admin/deletion-requests — list all deletion requests
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

export async function GET(request: NextRequest) {
  await requirePlatformAdmin();

  const status = request.nextUrl.searchParams.get('status');
  const type = request.nextUrl.searchParams.get('type');

  const db = createAdminClient();

  let query = (db.from('account_deletion_requests') as AnyQuery)
    .select('*')
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }
  if (type && type !== 'all') {
    query = query.eq('request_type', type);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  }

  // Fetch user emails for requester info (separate query to avoid join issues on new tables)
  const userIds = [...new Set((data ?? []).map((r: Record<string, unknown>) => r.user_id).filter(Boolean))] as string[];
  const communityIds = [...new Set((data ?? []).map((r: Record<string, unknown>) => r.community_id).filter(Boolean))] as number[];

  const userMap = new Map<string, { email: string; name: string | null }>();
  const communityMap = new Map<number, string>();

  if (userIds.length > 0) {
    const { data: users } = await (db
      .from('users')
      .select('id, email, raw_user_meta_data')
      .in('id', userIds) as AnyQuery);

    for (const u of users ?? []) {
      const user = u as { id: string; email: string; raw_user_meta_data: Record<string, unknown> | null };
      const meta = user.raw_user_meta_data;
      const name = meta ? `${meta.first_name ?? ''} ${meta.last_name ?? ''}`.trim() || null : null;
      userMap.set(user.id, { email: user.email, name });
    }
  }

  if (communityIds.length > 0) {
    const { data: communities } = await (db
      .from('communities')
      .select('id, name')
      .in('id', communityIds) as AnyQuery);

    for (const c of communities ?? []) {
      const comm = c as { id: number; name: string };
      communityMap.set(comm.id, comm.name);
    }
  }

  const requests = (data ?? []).map((row: Record<string, unknown>) => {
    const userId = row.user_id as string;
    const communityId = row.community_id as number | null;
    const userInfo = userMap.get(userId);

    return {
      id: row.id,
      requestType: row.request_type,
      userId,
      communityId,
      status: row.status,
      coolingEndsAt: row.cooling_ends_at,
      scheduledPurgeAt: row.scheduled_purge_at,
      purgedAt: row.purged_at,
      cancelledAt: row.cancelled_at,
      recoveredAt: row.recovered_at,
      interventionNotes: row.intervention_notes,
      createdAt: row.created_at,
      requesterEmail: userInfo?.email ?? null,
      requesterName: userInfo?.name ?? null,
      communityName: communityId ? communityMap.get(communityId) ?? null : null,
    };
  });

  return NextResponse.json({ requests });
}
