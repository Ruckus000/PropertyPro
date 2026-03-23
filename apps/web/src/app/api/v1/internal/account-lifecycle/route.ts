/**
 * POST /api/v1/internal/account-lifecycle
 *
 * Daily cron job that handles all account lifecycle state transitions:
 * 1. Deletion cooling → soft-delete (30-day cooling expired)
 * 2. Deletion purge (6-month purge window expired)
 * 3. Free access expiry notifications (14d, 7d, expired)
 *
 * Auth: cron secret (ACCOUNT_LIFECYCLE_CRON_SECRET)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { eq, and, lt, isNull, isNotNull, sql } from '@propertypro/db/filters';
import { accessPlans, accountDeletionRequests } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import {
  executeUserSoftDelete,
  executeCommunitySoftDelete,
  purgeUserPII,
  purgeCommunityData,
  computeAccessPlanStatus,
} from '@/lib/services/account-lifecycle-service';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.ACCOUNT_LIFECYCLE_CRON_SECRET);

  const db = createUnscopedClient();
  const now = new Date();
  const summary = {
    softDeleted: { users: 0, communities: 0 },
    purged: { users: 0, communities: 0 },
    notifications: { sent14d: 0, sent7d: 0, sentExpired: 0 },
    errors: [] as string[],
  };

  // -------------------------------------------------------------------------
  // 1. Cooling → soft-delete
  // -------------------------------------------------------------------------
  const coolingExpired = await db
    .select({ id: accountDeletionRequests.id, requestType: accountDeletionRequests.requestType })
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.status, 'cooling'),
        lt(accountDeletionRequests.coolingEndsAt, now),
      ),
    );

  for (const req of coolingExpired) {
    try {
      if (req.requestType === 'user') {
        await executeUserSoftDelete(req.id);
        summary.softDeleted.users++;
      } else {
        await executeCommunitySoftDelete(req.id);
        summary.softDeleted.communities++;
      }
    } catch (err) {
      summary.errors.push(`soft-delete ${req.requestType} ${req.id}: ${String(err)}`);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Soft-deleted → purge
  // -------------------------------------------------------------------------
  const purgeReady = await db
    .select({ id: accountDeletionRequests.id, requestType: accountDeletionRequests.requestType })
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.status, 'soft_deleted'),
        isNotNull(accountDeletionRequests.scheduledPurgeAt),
        lt(accountDeletionRequests.scheduledPurgeAt, now),
        isNull(accountDeletionRequests.purgedAt),
      ),
    );

  for (const req of purgeReady) {
    try {
      if (req.requestType === 'user') {
        await purgeUserPII(req.id);
        summary.purged.users++;
      } else {
        await purgeCommunityData(req.id);
        summary.purged.communities++;
      }
    } catch (err) {
      summary.errors.push(`purge ${req.requestType} ${req.id}: ${String(err)}`);
    }
  }

  // -------------------------------------------------------------------------
  // 3. Free access expiry notifications
  // -------------------------------------------------------------------------
  const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Find plans needing notifications (active, not revoked/converted)
  const activePlans = await db
    .select()
    .from(accessPlans)
    .where(
      and(
        isNull(accessPlans.revokedAt),
        isNull(accessPlans.convertedAt),
      ),
    );

  for (const plan of activePlans) {
    const status = computeAccessPlanStatus(plan);
    if (status !== 'active' && status !== 'in_grace') continue;

    const expiresAt = new Date(plan.expiresAt);
    const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    // 14-day warning
    if (daysUntilExpiry <= 14 && daysUntilExpiry > 7 && !plan.email14dSentAt) {
      await db
        .update(accessPlans)
        .set({ email14dSentAt: now })
        .where(eq(accessPlans.id, plan.id));
      summary.notifications.sent14d++;
      // TODO: Send email via packages/email when email service is wired
    }

    // 7-day warning
    if (daysUntilExpiry <= 7 && daysUntilExpiry > 0 && !plan.email7dSentAt) {
      await db
        .update(accessPlans)
        .set({ email7dSentAt: now })
        .where(eq(accessPlans.id, plan.id));
      summary.notifications.sent7d++;
      // TODO: Send email via packages/email when email service is wired
    }

    // Expired notification
    if (status === 'in_grace' && !plan.emailExpiredSentAt) {
      await db
        .update(accessPlans)
        .set({ emailExpiredSentAt: now })
        .where(eq(accessPlans.id, plan.id));
      summary.notifications.sentExpired++;
      // TODO: Send email via packages/email when email service is wired
    }
  }

  return NextResponse.json({ ok: true, summary });
});
