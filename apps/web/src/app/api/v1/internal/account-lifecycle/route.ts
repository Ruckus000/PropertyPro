/**
 * POST /api/v1/internal/account-lifecycle
 *
 * Daily cron job that handles all account lifecycle state transitions:
 * 1. Deletion cooling → soft-delete (30-day cooling expired)
 * 2. Deletion purge (6-month purge window expired)
 * 3. Free access expiry notifications (14d, 7d, expired)
 * 4. site_blocks soft-delete cleanup (30-day retention)
 * 5. site_publish_snapshots payload retention (keep the log, drop the payload)
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
  PURGE_SAFETY_CAP,
  readPurgeDryRun,
} from '@/lib/account-lifecycle/purge-guards';
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
import {
  cleanupSoftDeletedSiteBlocks,
  pruneSitePublishSnapshots,
} from '@/lib/services/site-blocks-service';
import { captureMessage } from '@sentry/nextjs';
import { withCronJob } from '@/lib/cron/with-cron-job';

const handler = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.ACCOUNT_LIFECYCLE_CRON_SECRET, process.env.CRON_SECRET);

  // Parsed before ANY phase runs, so a malformed value costs no destructive
  // work — parsing after phase 1 would soft-delete and then reject.
  const purgeDryRun = readPurgeDryRun(req.nextUrl.searchParams);

  const now = new Date();
  const summary = {
    softDeleted: { users: 0, communities: 0 },
    // Requests that raced out of 'cooling' (cancelled/recovered) between the
    // scan and the state-guarded batch write — surfaced for observability.
    skipped: { users: 0, communities: 0 },
    purged: { users: 0, communities: 0 },
    // Under `dryRun` the `purged` counts above mean "would have purged". This
    // block is what tells the reader which of the two they are looking at.
    purge: { dryRun: purgeDryRun, candidates: 0, cap: PURGE_SAFETY_CAP },
    notifications: { sent14d: 0, sent7d: 0, sentExpired: 0 },
    siteBlocksCleaned: 0,
    sitePublishSnapshotsPruned: 0,
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
      // Any requested id not returned raced out of 'cooling' and was skipped
      // by the state guard rather than force-deleted.
      summary.skipped.users += userDeletionIds.length - results.length;
    } catch (err) {
      summary.errors.push(`batch soft-delete user: ${String(err)}`);
    }
  }

  if (communityDeletionIds.length > 0) {
    try {
      const results = await executeCommunitySoftDelete(communityDeletionIds);
      summary.softDeleted.communities += results.length;
      summary.skipped.communities += communityDeletionIds.length - results.length;
    } catch (err) {
      summary.errors.push(`batch soft-delete community: ${String(err)}`);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Soft-deleted → purge
  // -------------------------------------------------------------------------
  const purgeReady = await findPurgeReadyDeletionRequests(now);
  summary.purge.candidates = purgeReady.length;

  // A circuit breaker, not a rate limiter. Over the cap we purge NOTHING:
  // if the candidate set is wrong, purging the first 50 of it is still purging
  // 50 wrong things, and doing so spreads irreversible damage across nights
  // instead of raising a signal on the first one. Each purge is its own
  // non-transactional unit, so there is nothing to roll back — the only safe
  // move is not to start.
  //
  // Deliberately not a throw: throwing would abort phases 3-5, which is exactly
  // the isolation `account-lifecycle-sweeps.test.ts` exists to defend. A cap
  // that trips silently is not a cap, so it goes to `summary.errors`, to
  // console.error, AND — since this is a circuit breaker on IRREVERSIBLE data
  // deletion — to its own named Sentry event. Its own name rather than the
  // generic `cron_job_reported_failures` so it can alert on every occurrence
  // instead of in a 30-minute digest: one tripped cap is worth waking for.
  let purgeBatch = purgeReady;
  if (purgeReady.length > PURGE_SAFETY_CAP) {
    const message =
      `purge aborted: ${purgeReady.length} candidates exceeds cap ${PURGE_SAFETY_CAP} — ` +
      'refusing to purge. This usually means the candidate predicate regressed, ' +
      'not that a genuine backlog appeared.';
    summary.errors.push(message);
    console.error(`[account-lifecycle] ${message}`);
    captureMessage('cron_purge_cap_tripped', {
      level: 'error',
      extra: { candidates: purgeReady.length, cap: PURGE_SAFETY_CAP },
    });
    purgeBatch = [];
  }

  for (const req of purgeBatch) {
    try {
      if (req.requestType === 'user') {
        if (!purgeDryRun) await purgeUserPII(req.id);
        summary.purged.users++;
      } else {
        if (!purgeDryRun) await purgeCommunityData(req.id);
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

  // -------------------------------------------------------------------------
  // 4. Site-blocks soft-delete cleanup (PR #8d — spec §2.7)
  //
  // Hard-delete site_blocks rows whose deleted_at is older than 30 days.
  // The publish transaction soft-deletes the previously-published row set
  // for accidental-publish recovery; this sweep completes the lifecycle.
  // -------------------------------------------------------------------------
  try {
    const result = await cleanupSoftDeletedSiteBlocks(now);
    summary.siteBlocksCleaned = result.deleted;
  } catch (err) {
    summary.errors.push(`cleanup site_blocks: ${String(err)}`);
  }

  // -------------------------------------------------------------------------
  // 5. Publish-snapshot retention (website editor v3 — Phase 6)
  //
  // NULLs the `snapshot` payload beyond the newest N publishes per community
  // and KEEPS the log row. The two halves are the whole design: the payload is
  // full page content an association may have deliberately taken down, so it
  // should not be retained forever; the log row is the answer to "what changed
  // on this statutory site, and when", so it must persist.
  //
  // Deliberately after the site_blocks sweep and in its own try/catch: a
  // failure here is a retention miss, not a correctness problem, and must not
  // cost the caller the soft-delete and purge work already done above. Errors
  // land in `summary.errors` for the same reason the sibling sweep's do.
  // -------------------------------------------------------------------------
  try {
    const result = await pruneSitePublishSnapshots();
    summary.sitePublishSnapshotsPruned = result.pruned;
  } catch (err) {
    summary.errors.push(`prune site_publish_snapshots: ${String(err)}`);
  }

  return NextResponse.json({ ok: true, summary });
});

// Vercel Cron issues GET; the GitHub-Actions era of this job issued POST.
// One handler serves both so the scheduler's verb can never be the thing that
// breaks the job. Neither reads a body, and the one query param either verb
// accepts (`?purgeDryRun=1`) makes the request strictly LESS mutating — so this
// is not the "state change via GET" hazard it might look like. The real hazard
// is the opposite, that this GET is destructive by default; that predates the
// flag and is gated by requireCronSecret on an Authorization header, which no
// prefetcher, link scanner or browser preconnect supplies.
const cronHandler = withCronJob('account-lifecycle', handler);

export const GET = cronHandler;
export const POST = cronHandler;
