/**
 * Scheduled community-site publishes — the "go live at…" half of blocker #7.
 *
 * Two audiences: the editor (schedule / cancel / read the pending one), and the
 * cron that fires them.
 *
 * ## Why the cron claims rows instead of just reading them
 *
 * Vercel Cron gives at-least-once delivery, and a slow tick can still be
 * running when the next fires. Reading `status = 'pending'` and then publishing
 * would let two ticks publish the same schedule. So the worker moves a row
 * `pending → running` with a CONDITIONAL update and acts only on rows that
 * update actually returned: the transition is the lock, and only one tick can
 * win it.
 *
 * ## Why a failure is recorded rather than retried forever
 *
 * A schedule that fires, fails and says nothing is worse than no schedule at
 * all — the PM believes their statutory notice went out. Every attempt writes a
 * terminal status and, on failure, the reason, so the editor can show it.
 */
import { sitePublishSchedules, logAuditEvent } from '@propertypro/db';
/*
 * The cron's claim scan is deliberately CROSS-TENANT — it looks for due
 * schedules in every community — so it cannot go through a community-scoped
 * client. Every statement below carries its own explicit predicate, and the
 * per-community entry points in this file use createScopedClient.
 */
// AUTHZ: cross-tenant cron claim scan; every statement carries its own explicit predicate.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { and, asc, eq, isNull, lte, sql } from '@propertypro/db/filters';
import { createScopedClient } from '@propertypro/db';
import { publishCommunitySite } from './site-blocks-service';
import { notifyResidentsOfSitePublish } from './site-publish-notification';

export type SitePublishScheduleStatus =
  | 'pending'
  | 'running'
  | 'published'
  | 'nothing_to_publish'
  | 'canceled'
  | 'failed';

export interface PendingSitePublishSchedule {
  id: number;
  scheduledFor: string;
  notifySummary: string | null;
}

/** How many due schedules one cron tick will process. */
const BATCH_SIZE = 25;

/**
 * The furthest ahead a publish may be scheduled.
 *
 * Not arbitrary: a schedule holds a draft hostage — the site cannot be
 * published normally without also shipping whatever else is staged — and a
 * year-out schedule that everyone has forgotten is a trap. Ninety days
 * comfortably covers the statutory notice windows this exists to serve
 * (14 days for owner meetings, 48 hours for board meetings).
 */
export const MAX_SCHEDULE_DAYS_AHEAD = 90;

export function maxScheduleDate(now: Date = new Date()): Date {
  return new Date(now.getTime() + MAX_SCHEDULE_DAYS_AHEAD * 24 * 60 * 60 * 1000);
}

/** The community's pending schedule, or null. */
export async function getPendingSitePublishSchedule(
  communityId: number,
): Promise<PendingSitePublishSchedule | null> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    sitePublishSchedules,
    {
      id: sitePublishSchedules.id,
      scheduledFor: sitePublishSchedules.scheduledFor,
      notifySummary: sitePublishSchedules.notifySummary,
    },
    and(
      eq(sitePublishSchedules.communityId, communityId),
      eq(sitePublishSchedules.status, 'pending'),
      isNull(sitePublishSchedules.deletedAt),
    ),
  )) as Array<{ id: number; scheduledFor: Date; notifySummary: string | null }>;

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    scheduledFor: row.scheduledFor.toISOString(),
    notifySummary: row.notifySummary,
  };
}

export interface ScheduleSitePublishInput {
  communityId: number;
  actorUserId: string;
  scheduledFor: Date;
  /** Resident-notification summary to use when it fires, or null for quiet. */
  notifySummary: string | null;
}

/**
 * Schedule a publish, replacing any existing pending one.
 *
 * Replace rather than reject-as-conflict: `site_publish_schedules_one_pending_idx`
 * makes one pending schedule per community a database invariant, and a PM
 * changing their mind about the time is the ordinary case. Cancelling first
 * would make the common path two round trips and leave a window with no
 * schedule at all.
 */
export async function scheduleSitePublish({
  communityId,
  actorUserId,
  scheduledFor,
  notifySummary,
}: ScheduleSitePublishInput): Promise<PendingSitePublishSchedule> {
  const scoped = createScopedClient(communityId);

  await scoped.update(
    sitePublishSchedules,
    { status: 'canceled', updatedAt: new Date() },
    and(
      eq(sitePublishSchedules.communityId, communityId),
      eq(sitePublishSchedules.status, 'pending'),
      isNull(sitePublishSchedules.deletedAt),
    ),
  );

  const inserted = (await scoped.insert(sitePublishSchedules, {
    communityId,
    scheduledFor,
    requestedBy: actorUserId,
    status: 'pending',
    notifySummary,
  })) as Array<{ id: number; scheduledFor: Date; notifySummary: string | null }>;

  const row = inserted[0]!;

  await logAuditEvent({
    userId: actorUserId,
    action: 'settings_changed',
    resourceType: 'site_publish_schedule',
    resourceId: String(row.id),
    communityId,
    newValues: {
      scheduledFor: scheduledFor.toISOString(),
      notifyResidents: notifySummary !== null,
    },
  });

  return {
    id: row.id,
    scheduledFor: row.scheduledFor.toISOString(),
    notifySummary: row.notifySummary,
  };
}

/** Cancel the pending schedule. Returns whether there was one to cancel. */
export async function cancelSitePublishSchedule(
  communityId: number,
  actorUserId: string,
): Promise<boolean> {
  const existing = await getPendingSitePublishSchedule(communityId);
  if (!existing) return false;

  const scoped = createScopedClient(communityId);
  await scoped.update(
    sitePublishSchedules,
    { status: 'canceled', updatedAt: new Date() },
    and(
      eq(sitePublishSchedules.communityId, communityId),
      eq(sitePublishSchedules.status, 'pending'),
      isNull(sitePublishSchedules.deletedAt),
    ),
  );

  await logAuditEvent({
    userId: actorUserId,
    action: 'settings_changed',
    resourceType: 'site_publish_schedule',
    resourceId: String(existing.id),
    communityId,
    oldValues: { scheduledFor: existing.scheduledFor, status: 'pending' },
    newValues: { status: 'canceled' },
  });

  return true;
}

export interface ProcessDueSitePublishesSummary {
  claimed: number;
  published: number;
  nothingToPublish: number;
  failed: number;
}

interface ClaimedRow {
  id: number;
  community_id: number;
  requested_by: string | null;
  notify_summary: string | null;
}

/**
 * Fire every schedule that is due. Called by the cron.
 *
 * Never throws for a single bad schedule: one community's failure must not stop
 * every other community's publish in the same tick.
 */
export async function processDueSitePublishes(
  now: Date = new Date(),
): Promise<ProcessDueSitePublishesSummary> {
  const db = createUnscopedClient();

  /*
   * Claim and select in ONE statement. `FOR UPDATE SKIP LOCKED` on the inner
   * select means concurrent ticks take disjoint rows rather than blocking on
   * each other, and the outer UPDATE's `status = 'pending'` predicate means a
   * row already claimed by another tick cannot be claimed twice. Only rows this
   * statement RETURNS are ours to act on.
   */
  const claimed = (await db.execute(sql`
    UPDATE site_publish_schedules
       SET status = 'running',
           attempt_count = attempt_count + 1,
           updated_at = now()
     WHERE id IN (
       SELECT id
         FROM site_publish_schedules
        WHERE status = 'pending'
          AND deleted_at IS NULL
          AND scheduled_for <= ${now}
        ORDER BY scheduled_for ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id, community_id, requested_by, notify_summary
  `)) as unknown as ClaimedRow[];

  const rows = Array.isArray(claimed)
    ? claimed
    : ((claimed as { rows?: ClaimedRow[] })?.rows ?? []);

  const summary: ProcessDueSitePublishesSummary = {
    claimed: rows.length,
    published: 0,
    nothingToPublish: 0,
    failed: 0,
  };

  for (const row of rows) {
    try {
      if (!row.requested_by) {
        /*
         * The scheduling manager's account was deleted before this fired.
         * `publishCommunitySite` stamps `actorUserId` into the publish snapshot's
         * audit trail, so there is no honest way to run this — a substituted
         * actor would attribute a publish to someone who did not make it. Fail
         * visibly instead.
         */
        throw new Error(
          'The manager who scheduled this publish no longer has an account. Reschedule it.',
        );
      }

      const result = await publishCommunitySite({
        communityId: row.community_id,
        actorUserId: row.requested_by,
        /*
         * Null skips the optimistic-concurrency check, which is correct here and
         * only here: that token exists to catch one EDITOR overwriting another's
         * work between load and publish. A schedule has no editor session and no
         * loaded snapshot — it means "publish whatever is staged at this time".
         * Passing a token would make an unrelated manual publish silently cancel
         * the scheduled one.
         */
        expectedPublishedAt: null,
      });

      if (result.published && row.notify_summary) {
        // Fire-and-report: the publish has committed, so a notification failure
        // must not mark the schedule failed. It is recorded by the notifier's
        // own audit entry.
        await notifyResidentsOfSitePublish({
          communityId: row.community_id,
          actorUserId: row.requested_by,
          summary: row.notify_summary,
        });
      }

      await finishSchedule(
        db,
        row.id,
        result.published ? 'published' : 'nothing_to_publish',
        null,
      );
      if (result.published) summary.published += 1;
      else summary.nothingToPublish += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[scheduled-site-publish] schedule failed', {
        scheduleId: row.id,
        communityId: row.community_id,
        error: message,
      });
      await finishSchedule(db, row.id, 'failed', message).catch(() => {
        // A failure to RECORD the failure must not abort the remaining rows.
      });
      summary.failed += 1;
    }
  }

  return summary;
}

async function finishSchedule(
  db: ReturnType<typeof createUnscopedClient>,
  id: number,
  status: SitePublishScheduleStatus,
  errorMessage: string | null,
): Promise<void> {
  await db.execute(sql`
    UPDATE site_publish_schedules
       SET status = ${status},
           executed_at = now(),
           error_message = ${errorMessage},
           updated_at = now()
     WHERE id = ${id}
  `);
}
