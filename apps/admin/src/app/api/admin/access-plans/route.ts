/**
 * Access Plans API for the admin console.
 *
 * GET  /api/admin/access-plans?communityId={id} — list plans for a community
 * POST /api/admin/access-plans — grant free access to a community
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';

function computeStatus(row: {
  revoked_at: string | null;
  converted_at: string | null;
  expires_at: string;
  grace_ends_at: string;
}): 'revoked' | 'converted' | 'active' | 'in_grace' | 'expired' {
  if (row.revoked_at) return 'revoked';
  if (row.converted_at) return 'converted';
  const now = new Date();
  if (now < new Date(row.expires_at)) return 'active';
  if (now < new Date(row.grace_ends_at)) return 'in_grace';
  return 'expired';
}

export async function GET(request: NextRequest) {
  await requirePlatformAdmin();

  const communityId = request.nextUrl.searchParams.get('communityId');
  if (!communityId || !Number.isInteger(Number(communityId))) {
    return NextResponse.json({ error: { message: 'communityId is required' } }, { status: 400 });
  }

  const db = createAdminTypedClient();

  const { data, error } = await (db
    .from('access_plans'))
    .select('*')
    .eq('community_id', Number(communityId))
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  }

  const plans = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    communityId: row.community_id,
    expiresAt: row.expires_at,
    graceEndsAt: row.grace_ends_at,
    durationMonths: row.duration_months,
    gracePeriodDays: row.grace_period_days,
    notes: row.notes,
    grantedBy: row.granted_by,
    grantedByEmail: null,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    convertedAt: row.converted_at,
    createdAt: row.created_at,
    status: computeStatus(row as { revoked_at: string | null; converted_at: string | null; expires_at: string; grace_ends_at: string }),
  }));

  return NextResponse.json({ plans });
}

export async function POST(request: NextRequest) {
  const admin = await requirePlatformAdmin();

  const body = await request.json();
  const { communityId, durationMonths, gracePeriodDays = 30, notes } = body as {
    communityId: number;
    durationMonths: number;
    gracePeriodDays?: number;
    notes?: string | null;
  };

  if (!communityId || !durationMonths || durationMonths < 1) {
    return NextResponse.json({ error: { message: 'communityId and durationMonths are required' } }, { status: 400 });
  }

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

  const graceEndsAt = new Date(expiresAt);
  graceEndsAt.setDate(graceEndsAt.getDate() + gracePeriodDays);

  const db = createAdminTypedClient();

  const { data, error } = await (db
    .from('access_plans'))
    .insert({
      community_id: communityId,
      expires_at: expiresAt.toISOString(),
      grace_ends_at: graceEndsAt.toISOString(),
      duration_months: durationMonths,
      grace_period_days: gracePeriodDays,
      granted_by: admin.id,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  }

  return NextResponse.json({ plan: data }, { status: 201 });
}
