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
import { createElement } from 'react';
import { NextResponse, type NextRequest } from 'next/server';
import { eq, and, lt, isNull, isNotNull, inArray } from '@propertypro/db/filters';
import { accessPlans, accountDeletionRequests, communities, users, userRoles } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import {
  sendEmail,
  FreeAccessExpiringEmail,
  FreeAccessExpiredEmail,
} from '@propertypro/email';
import {
  executeUserSoftDelete,
  executeCommunitySoftDelete,
  purgeUserPII,
  purgeCommunityData,
  computeAccessPlanStatus,
} from '@/lib/services/account-lifecycle-service';

// ---------------------------------------------------------------------------
// Admin recipient lookup (same pattern as payment-alert-scheduler)
// ---------------------------------------------------------------------------

// V2 role enum values for community admins who should receive lifecycle notifications
const LIFECYCLE_ADMIN_ROLES = ['manager', 'pm_admin'] as const;

interface AdminRecipient { email: string; fullName: string; }

async function lookupCommunityAdmins(communityId: number): Promise<AdminRecipient[]> {
  const db = createUnscopedClient();
  return db
    .select({ email: users.email, fullName: users.fullName })
    .from(userRoles)
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(userRoles.communityId, communityId),
        inArray(userRoles.role, [...LIFECYCLE_ADMIN_ROLES]),
      ),
    );
}

async function getCommunityName(communityId: number): Promise<string> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({ name: communities.name })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  return row?.name ?? 'Your Community';
}

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
      const recipients = await lookupCommunityAdmins(plan.communityId);
      const communityName = await getCommunityName(plan.communityId);
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
      await db
        .update(accessPlans)
        .set({ email7dSentAt: now })
        .where(eq(accessPlans.id, plan.id));
      const recipients = await lookupCommunityAdmins(plan.communityId);
      const communityName = await getCommunityName(plan.communityId);
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
      await db
        .update(accessPlans)
        .set({ emailExpiredSentAt: now })
        .where(eq(accessPlans.id, plan.id));
      const recipients = await lookupCommunityAdmins(plan.communityId);
      const communityName = await getCommunityName(plan.communityId);
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
