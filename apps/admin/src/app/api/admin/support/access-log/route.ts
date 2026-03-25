/**
 * Support access log API.
 *
 * GET /api/admin/support/access-log?communityId={id} — list access log entries for a community
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';

// Supabase untyped client — support tables are not yet in generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

export async function GET(request: NextRequest) {
  await requirePlatformAdmin();

  const communityIdParam = request.nextUrl.searchParams.get('communityId');
  const communityId = communityIdParam ? Number(communityIdParam) : NaN;
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: 'A valid positive communityId query parameter is required' },
      { status: 400 },
    );
  }

  const db = createAdminClient();

  const { data, error } = await (db
    .from('support_access_log') as AnyQuery)
    .select('*')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [] });
}
