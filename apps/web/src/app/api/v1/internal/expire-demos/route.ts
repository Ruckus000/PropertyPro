import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { emitConversionEvent } from '@/lib/services/conversion-events';
import {
  banDemoAuthUser,
  expireStaleAccessRequests,
  findDemosEnteringGrace,
  findExpiredDemos,
  softDeleteExpiredDemo,
} from '@/lib/services/demo-conversion';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.DEMO_EXPIRY_CRON_SECRET);

  const now = new Date();

  // ── Step 1: Detect demos entering grace period ──
  const enteringGrace = await findDemosEnteringGrace(now);

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
  const expired = await findExpiredDemos(now);
  let count = 0;

  for (const row of expired) {
    await softDeleteExpiredDemo({
      communityId: row.communityId,
      demoInstanceId: row.demoInstanceId,
      now,
    });

    // Ban demo auth users
    const userIds = [row.demoResidentUserId, row.demoBoardUserId].filter(Boolean);
    for (const userId of userIds) {
      const result = await banDemoAuthUser(userId!);
      if (result.ok) {
        console.info(`[expire-demos] banned demo user ${userId}`);
      } else {
        // Non-fatal: demo user may have already been deleted or banned
        console.warn(`[expire-demos] failed to ban demo user ${userId}: ${result.error}`);
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
  const expiredRequests = await expireStaleAccessRequests(now);

  console.info(`[expire-demos] expired ${expiredRequests.length} stale access requests`);

  return NextResponse.json({
    data: {
      expired: count,
      graceDetected: enteringGrace.length,
      expiredRequests: expiredRequests.length,
    },
  });
});
