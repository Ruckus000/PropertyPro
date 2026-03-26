import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { demoInstances, communities, accessRequests } from '@propertypro/db';
import { eq, and, isNull, lt, gt, inArray, sql } from '@propertypro/db/filters';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { emitConversionEvent } from '@/lib/services/conversion-events';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.DEMO_EXPIRY_CRON_SECRET);

  const db = createUnscopedClient();
  const now = new Date();

  // ── Step 1: Detect demos entering grace period ──
  // Demos where trial has ended but demo hasn't expired yet
  const enteringGrace = await db
    .select({
      communityId: communities.id,
      demoInstanceId: demoInstances.id,
      trialEndsAt: communities.trialEndsAt,
    })
    .from(communities)
    .innerJoin(demoInstances, eq(demoInstances.seededCommunityId, communities.id))
    .where(
      and(
        eq(communities.isDemo, true),
        lt(communities.trialEndsAt, now),
        gt(communities.demoExpiresAt, now),
        isNull(communities.deletedAt),
        isNull(demoInstances.deletedAt),
      ),
    );

  for (const row of enteringGrace) {
    await emitConversionEvent({
      demoId: row.demoInstanceId,
      communityId: row.communityId,
      eventType: 'grace_started',
      source: 'cron',
      dedupeKey: `demo:${row.demoInstanceId}:grace_started`,
      occurredAt: row.trialEndsAt ?? now,
    });
  }

  if (enteringGrace.length > 0) {
    console.info(`[expire-demos] emitted grace_started for ${enteringGrace.length} demo(s)`);
  }

  // ── Step 2: Expire demos past demo_expires_at ──
  const expired = await db
    .select({
      communityId: communities.id,
      demoInstanceId: demoInstances.id,
      demoResidentUserId: demoInstances.demoResidentUserId,
      demoBoardUserId: demoInstances.demoBoardUserId,
    })
    .from(communities)
    .innerJoin(demoInstances, eq(demoInstances.seededCommunityId, communities.id))
    .where(
      and(
        eq(communities.isDemo, true),
        lt(communities.demoExpiresAt, now),
        isNull(communities.deletedAt),
        isNull(demoInstances.deletedAt),
      ),
    );

  const admin = createAdminClient();
  let count = 0;

  for (const row of expired) {
    // Soft-delete the community
    await db
      .update(communities)
      .set({ deletedAt: now })
      .where(and(eq(communities.id, row.communityId), isNull(communities.deletedAt)));

    // Soft-delete the demo instance
    await db
      .update(demoInstances)
      .set({ deletedAt: now })
      .where(and(eq(demoInstances.id, row.demoInstanceId), isNull(demoInstances.deletedAt)));

    // Ban demo auth users
    const userIds = [row.demoResidentUserId, row.demoBoardUserId].filter(Boolean);
    for (const userId of userIds) {
      try {
        await admin.auth.admin.updateUserById(userId!, { ban_duration: '876600h' });
        console.info(`[expire-demos] banned demo user ${userId}`);
      } catch (err) {
        // Non-fatal: demo user may have already been deleted or banned
        console.warn(`[expire-demos] failed to ban demo user ${userId}:`, err);
      }
    }

    // Emit demo_soft_deleted event (awaited best-effort)
    await emitConversionEvent({
      demoId: row.demoInstanceId,
      communityId: row.communityId,
      eventType: 'demo_soft_deleted',
      source: 'cron',
      dedupeKey: `demo:${row.demoInstanceId}:soft_deleted`,
      occurredAt: now,
    });

    console.info(
      `[expire-demos] expired community ${row.communityId} / demo instance ${row.demoInstanceId}`,
    );
    count++;
  }

  // ── Step 3: Expire stale access requests older than 30 days ──
  const expiredRequests = await db
    .update(accessRequests)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        inArray(accessRequests.status, ['pending_verification', 'pending']),
        lt(accessRequests.createdAt, sql`now() - interval '30 days'`),
        isNull(accessRequests.deletedAt),
      ),
    )
    .returning({ id: accessRequests.id });

  console.info(`[expire-demos] expired ${expiredRequests.length} stale access requests`);

  return NextResponse.json({ data: { expired: count, graceDetected: enteringGrace.length, expiredRequests: expiredRequests.length } });
});
