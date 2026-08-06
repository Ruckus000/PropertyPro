/**
 * Access Plans API for the admin console.
 *
 * GET  /api/admin/access-plans?communityId={id} — list plans for a community
 * POST /api/admin/access-plans — grant free access to a community
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { assertNoDbError } from '@/lib/api/assert-no-db-error';
import { COMMUNITY_LIST_LIMIT } from '@/lib/api/list-limits';
import { logAdminAction } from '@/lib/audit/log-admin-action';
import { parseAdminBody } from '@/lib/api/parse-body';

/**
 * Granting free access is a MONEY decision, so the duration bounds are real
 * limits rather than sanity checks.
 *
 * `durationMonths` and `gracePeriodDays` were previously unbounded numbers fed
 * straight into `setMonth()` / `setDate()`. A large value produced an
 * effectively permanent free grant (and a big enough one produces an Invalid
 * Date, which lands in the DB as garbage). 24 months and 365 days are well
 * beyond any legitimate trial while still being finite.
 */
const grantSchema = z.object({
  communityId: z.number().int().positive(),
  durationMonths: z.number().int().min(1).max(24),
  gracePeriodDays: z.number().int().min(0).max(365).optional().default(30),
  notes: z.string().max(2000).nullish(),
});

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

export const GET = withAdminErrorHandler(async (request: NextRequest) => {
  await requirePlatformAdmin();

  // `Number.isInteger(Number(x))` alone accepted "0", "-5" and " " (all of
  // which Number() maps to a valid integer), so parse to a positive integer.
  const rawCommunityId = request.nextUrl.searchParams.get('communityId');
  const communityId = Number(rawCommunityId);
  if (!rawCommunityId || !Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { message: 'communityId is required and must be a positive integer' } },
      { status: 400 },
    );
  }

  const db = createAdminTypedClient();

  const { data, error } = await (db
    .from('access_plans'))
    .select('*')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false })
    .limit(COMMUNITY_LIST_LIMIT);

  assertNoDbError(error, 'Failed to list access plans');

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
});

export const POST = withAdminErrorHandler(async (request: NextRequest) => {
  const admin = await requirePlatformAdmin();

  const parsed = await parseAdminBody(request, grantSchema);
  if (parsed instanceof NextResponse) return parsed;

  const { communityId, durationMonths, gracePeriodDays, notes } = parsed;

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

  assertNoDbError(error, 'Failed to create access plan');

  // Denormalize grace expiry onto the communities row so the
  // subscription-guard middleware (which reads communities.free_access_expires_at)
  // sees the grant. The web-side service does this in the same transaction;
  // here we do it as a follow-up write — best-effort consistency, errors logged.
  const { error: communityUpdateError } = await (db
    .from('communities'))
    .update({ free_access_expires_at: graceEndsAt.toISOString() })
    .eq('id', communityId);

  if (communityUpdateError) {
    console.error(
      '[admin/access-plans] Plan inserted but community.free_access_expires_at update failed:',
      communityUpdateError.message,
    );
  }

  await logAdminAction({
    admin,
    action: 'access_plan_granted',
    resourceType: 'access_plan',
    resourceId: (data as { id?: number } | null)?.id,
    communityId,
    newValues: {
      duration_months: durationMonths,
      grace_period_days: gracePeriodDays,
      expires_at: expiresAt.toISOString(),
      grace_ends_at: graceEndsAt.toISOString(),
      notes: notes ?? null,
    },
    metadata: { community_update_failed: Boolean(communityUpdateError) },
  });

  return NextResponse.json({ plan: data }, { status: 201 });
});
