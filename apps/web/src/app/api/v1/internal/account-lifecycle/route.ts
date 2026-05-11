/**
 * POST /api/v1/internal/account-lifecycle
 *
 * Daily cron job that handles all account lifecycle state transitions:
 * 1. Deletion cooling → soft-delete (30-day cooling expired)
 * 2. Deletion purge (6-month purge window expired)
 * 3. Free access expiry notifications (14d, 7d, expired)
 *
 * All cross-tenant DB ops live in account-lifecycle-service (A3 drain #63);
 * the route is now pure orchestration: cron-secret check, per-row dispatch
 * across the 3 phases, error capture, summary aggregation.
 *
 * Auth: cron secret (ACCOUNT_LIFECYCLE_CRON_SECRET)
 */
import { createElement } from 'react';
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import {
  sendEmail,
  FreeAccessExpiringEmail,
  FreeAccessExpiredEmail,
} from '@propertypro/email';
import {
  computeAccessPlanStatus,
  executeCommunitySoftDelete,
  executeUserSoftDelete,
  findCoolingExpiredDeletionRequests,
  findPurgeReadyDeletionRequests,
  getCommunityNameForLifecycleEmail,
  listActiveAccessPlansForLifecycleCron,
  lookupLifecycleAdminRecipients,
  markAccessPlanNotificationSent,
  purgeCommunityData,
  purgeUserPII,
} from '@/lib/services/account-lifecycle-service';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.ACCOUNT_LIFECYCLE_CRON_SECRET);

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
  const coolingExpired = await findCoolingExpiredDeletionRequests(now);

  const userDeletionIds = coolingExpired.filter(req => req.requestType === 'user').map(req => req.id);
  const communityDeletionIds = coolingExpired.filter(req => req.requestType === 'community').map(req => req.id);

  if (userDeletionIds.length > 0) {
    try {
      const results = await executeUserSoftDelete(userDeletionIds);
      summary.softDeleted.users += results.length;
    } catch (err) {
      summary.errors.push(`batch soft-delete user: ${String(err)}`);
    }
  }

  if (communityDeletionIds.length > 0) {
    try {
      const results = await executeCommunitySoftDelete(communityDeletionIds);
      summary.softDeleted.communities += results.length;
    } catch (err) {
      summary.errors.push(`batch soft-delete community: ${String(err)}`);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Soft-deleted → purge
  // -------------------------------------------------------------------------
  const purgeReady = await findPurgeReadyDeletionRequests(now);

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
  const activePlans = await listActiveAccessPlansForLifecycleCron();

  for (const plan of activePlans) {
    const status = computeAccessPlanStatus(plan);
    if (status !== 'active' && status !== 'in_grace') continue;

    const expiresAt = new Date(plan.expiresAt);
    const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    // 14-day warning
    if (daysUntilExpiry <= 14 && daysUntilExpiry > 7 && !plan.email14dSentAt) {
      await markAccessPlanNotificationSent(plan.id, 'email14dSentAt', now);
      const recipients = await lookupLifecycleAdminRecipients(plan.communityId);
      const communityName = await getCommunityNameForLifecycleEmail(plan.communityId);
      await Promise.allSettled(
        recipients.map((r) =>
          sendEmail({
            to: r.email,
            subject: `Free access expires in ${daysUntilExpiry} days — ${communityName}`,
            category: 'transactional',
            react: createElement(FreeAccessExpiringEmail, {
              branding: { communityName },
              recipientName: r.fullName,
              communityName,
              daysRemaining: daysUntilExpiry,
              subscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/settings/billing`,
            }),
          }),
        ),
      );
      summary.notifications.sent14d++;
    }

    // 7-day warning
    if (daysUntilExpiry <= 7 && daysUntilExpiry > 0 && !plan.email7dSentAt) {
      await markAccessPlanNotificationSent(plan.id, 'email7dSentAt', now);
      const recipients = await lookupLifecycleAdminRecipients(plan.communityId);
      const communityName = await getCommunityNameForLifecycleEmail(plan.communityId);
      await Promise.allSettled(
        recipients.map((r) =>
          sendEmail({
            to: r.email,
            subject: `Free access expires in ${daysUntilExpiry} days — ${communityName}`,
            category: 'transactional',
            react: createElement(FreeAccessExpiringEmail, {
              branding: { communityName },
              recipientName: r.fullName,
              communityName,
              daysRemaining: daysUntilExpiry,
              subscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/settings/billing`,
            }),
          }),
        ),
      );
      summary.notifications.sent7d++;
    }

    // Expired notification (now in grace period)
    if (status === 'in_grace' && !plan.emailExpiredSentAt) {
      await markAccessPlanNotificationSent(plan.id, 'emailExpiredSentAt', now);
      const recipients = await lookupLifecycleAdminRecipients(plan.communityId);
      const communityName = await getCommunityNameForLifecycleEmail(plan.communityId);
      const graceEndsAt = new Date(plan.graceEndsAt);
      const graceDaysRemaining = Math.max(0, Math.ceil((graceEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
      await Promise.allSettled(
        recipients.map((r) =>
          sendEmail({
            to: r.email,
            subject: `Free access has ended — ${communityName}`,
            category: 'transactional',
            react: createElement(FreeAccessExpiredEmail, {
              branding: { communityName },
              recipientName: r.fullName,
              communityName,
              subscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/settings/billing`,
              graceDaysRemaining,
            }),
          }),
        ),
      );
      summary.notifications.sentExpired++;
    }
  }

  return NextResponse.json({ ok: true, summary });
});
