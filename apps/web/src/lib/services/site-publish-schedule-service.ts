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
import { ConflictError } from '@/lib/api/errors';
import { publishCommunitySite } from './site-blocks-service';
import { notifyResidentsOfSitePublish } from './site-publish-notification';

export type SitePublishScheduleStatus =
  | 'pending'
  | 'running'
  | 'published'
  | 'nothing_to_publish'
  | 'canceled'
  | 'failed';

export interface EditorSitePublishSchedule {
  id: number;
  /**
   * `pending` — armed. `running` — a tick is publishing it right now.
   * `failed` — every attempt was used and nothing was published.
   */
  status: 'pending' | 'running' | 'failed';
  scheduledFor: string;
  notifySummary: string | null;
  /** PM-facing reason, set only on `failed`. Never raw driver text. */
  errorMessage: string | null;
}

/** @deprecated Kept as an alias while callers migrate to the widened shape. */
export type PendingSitePublishSchedule = EditorSitePublishSchedule;

/**
 * Bind a `Date` into a raw `sql` template.
 *
 * postgres-js picks a serialiser for an untyped bind parameter from the JS type
 * it is handed, and it has no case for `Date`: it throws `ERR_INVALID_ARG_TYPE`
 * ("Received an instance of Date") on the CLIENT, before a packet is sent. The
 * failure therefore surfaces as a query error for a statement Postgres never
 * saw — which is why a missing column was the first thing suspected when this
 * took `/api/v1/internal/scheduled-site-publish` down on every run.
 *
 * Drizzle's QUERY BUILDER never hits this: a column's `timestamp` type tells it
 * to serialise the Date itself, which is why the sibling `claimNextExportJob`,
 * the same lease pattern written through the builder, was unaffected. A raw
 * template has no column to consult, so the conversion has to happen here.
 *
 * `toISOString()` is exactly what drizzle's own `withTimezone` serialiser
 * emits, so a value bound through this helper and one written via the builder
 * are identical on the wire.
 *
 * Every `Date` interpolated into a raw statement in this file goes through it.
 */
function ts(value: Date): string {
  return value.toISOString();
}

/** How long a failed schedule keeps being reported to the editor. */
const FAILED_VISIBLE_DAYS = 7;

/** How many due schedules one cron tick will process. */
const BATCH_SIZE = 25;

/**
 * How long a tick holds a claim before another tick may take the row back.
 *
 * The recovery mechanism, not a performance knob. A Vercel function killed by
 * the platform deadline throws nothing — no catch block runs, no terminal
 * status is written — so without a lease a claimed row would sit in `running`
 * forever: never re-claimed, and invisible to the PM, whose statutory notice
 * then silently never goes out. A lapsed lease makes the row claimable again,
 * which is why reclaiming a crashed tick is the SAME code path as a fresh claim.
 *
 * 10 minutes, matching `EXPORT_JOB_LEASE_MS`, comfortably exceeds a publish and
 * comfortably precedes the next 15-minute tick.
 */
const LEASE_MS = 10 * 60 * 1000;

/** Exported for tests, which assert the exact expiry the claim writes. */
export const SITE_PUBLISH_SCHEDULE_LEASE_MS = LEASE_MS;

/**
 * Walks `cause` because the driver wraps the original error — a top-level
 * `code` check alone misses it. Local rather than shared: the repo already has
 * several copies of this and consolidating them is worth doing, but not inside
 * a defect fix that would then touch three unrelated services.
 */
function hasPostgresErrorCode(error: unknown, expectedCode: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && (error as { code: unknown }).code === expectedCode) return true;
  if ('cause' in error) return hasPostgresErrorCode((error as { cause: unknown }).cause, expectedCode);
  return false;
}

/** 23505 — here, always the one-active-schedule-per-community index. */
function isUniqueViolation(error: unknown): boolean {
  return hasPostgresErrorCode(error, '23505');
}

/**
 * How many times a schedule is attempted before it is given up on.
 *
 * A code constant rather than a per-row column: nothing wants per-schedule
 * retry budgets, and `notification-digest-processor` sets the same precedent
 * with its own `MAX_ATTEMPTS`.
 */
const MAX_ATTEMPTS = 3;

/**
 * What the PM is told when one attempt fails. Deliberately free of internal
 * detail — see the note at the throw site.
 */
const SCHEDULE_FAILURE_MESSAGE =
  "This scheduled publish didn't finish, so nothing was published. It will be retried automatically.";

/** What the PM is told once every attempt is spent. */
const SCHEDULE_EXHAUSTED_MESSAGE =
  "This scheduled publish was retried until it ran out of attempts and never finished. Nothing was published. Schedule it again, or publish now.";

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
export async function getSitePublishScheduleForEditor(
  communityId: number,
  now: Date = new Date(),
): Promise<EditorSitePublishSchedule | null> {
  const db = createUnscopedClient();
  const failedCutoff = new Date(now.getTime() - FAILED_VISIBLE_DAYS * 24 * 60 * 60 * 1000);

  /*
   * ONE row: the live schedule if there is one, otherwise a recent failure.
   *
   * `ORDER BY created_at DESC LIMIT 1` does the precedence without a CASE — a
   * newly armed schedule is always newer than the failure it replaces, so it
   * naturally wins. The 7-day cutoff is what keeps this a status read rather
   * than a history query, and stops a failure becoming a permanent tombstone
   * the PM has no way to dismiss.
   */
  const result = (await db.execute(sql`
    SELECT id, status, scheduled_for, notify_summary, error_message
      FROM site_publish_schedules
     WHERE community_id = ${communityId}
       AND deleted_at IS NULL
       AND (
         status IN ('pending', 'running')
         OR (status = 'failed' AND executed_at >= ${ts(failedCutoff)})
       )
     ORDER BY created_at DESC
     LIMIT 1
  `)) as unknown as Array<{
    id: number;
    status: 'pending' | 'running' | 'failed';
    scheduled_for: Date;
    notify_summary: string | null;
    error_message: string | null;
  }>;

  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: typeof result })?.rows ?? []);
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    status: row.status,
    scheduledFor: new Date(row.scheduled_for).toISOString(),
    notifySummary: row.notify_summary,
    errorMessage: row.error_message,
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
 * Replace rather than reject-as-conflict: `site_publish_schedules_one_active_idx`
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
  const db = createUnscopedClient();

  /*
   * One transaction, because cancel-then-insert must be atomic. As two
   * statements an insert that failed after the cancel committed would leave the
   * community with NO schedule and the PM with an error that looks identical to
   * "nothing happened" — silently discarding a schedule they had already made.
   *
   * `createScopedClient` exposes only query/insert/update and has no
   * transaction, so this uses the unscoped client with an explicit
   * `community_id` predicate on every statement, exactly as `publishCommunitySite`
   * does.
   */
  const row = await db
    .transaction(async (tx) => {
      /*
       * The row lock, and the primary fix for the race. It serialises two
       * managers scheduling at once AND a schedule racing an immediate publish,
       * which takes the same lock. The unique-violation catch below is only the
       * backstop for the window this does not cover.
       */
      await tx.execute(sql`SELECT id FROM communities WHERE id = ${communityId} FOR UPDATE`);

      /*
       * `pending` only — never a `running` row. A worker is mid-publish inside
       * one: cancelling would race its `finishSchedule` and, worse, free the
       * exclusivity slot so a second schedule could be armed during a live
       * publish. If the slot is held by a running row the insert below fails on
       * the index, which is exactly the right answer.
       */
      await tx.execute(sql`
        UPDATE site_publish_schedules
           SET status = 'canceled', updated_at = now()
         WHERE community_id = ${communityId}
           AND status = 'pending'
           AND deleted_at IS NULL
      `);

      const inserted = (await tx.execute(sql`
        INSERT INTO site_publish_schedules
          (community_id, scheduled_for, requested_by, status, notify_summary)
        VALUES (${communityId}, ${ts(scheduledFor)}, ${actorUserId}, 'pending', ${notifySummary})
        RETURNING id, scheduled_for, notify_summary
      `)) as unknown as Array<{ id: number; scheduled_for: Date; notify_summary: string | null }>;

      const rows = Array.isArray(inserted)
        ? inserted
        : ((inserted as { rows?: typeof inserted })?.rows ?? []);
      return rows[0]!;
    })
    .catch((error: unknown) => {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          'A scheduled publish for this community is running right now. Wait a minute and try again.',
        );
      }
      throw error;
    });

  // Outside the transaction on purpose: an audit-log failure must not roll back
  // a schedule the PM was told about.
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
    // A freshly inserted row is always pending with nothing to report; stated
    // explicitly so the POST response and the GET response are the same shape.
    status: 'pending',
    scheduledFor: new Date(row.scheduled_for).toISOString(),
    notifySummary: row.notify_summary,
    errorMessage: null,
  };
}

/** Cancel the pending schedule. Returns whether there was one to cancel. */
export async function cancelSitePublishSchedule(
  communityId: number,
  actorUserId: string,
): Promise<boolean> {
  const existing = await getSitePublishScheduleForEditor(communityId);
  if (!existing || existing.status !== 'pending') return false;

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
  /** Schedules given up on this tick because they ran out of attempts. */
  exhausted: number;
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

  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);

  /*
   * Claim and select in ONE statement. `FOR UPDATE SKIP LOCKED` on the inner
   * select means concurrent ticks take disjoint rows rather than blocking on
   * each other, and it holds the row lock for the whole statement — so a row
   * claimed by another tick cannot be claimed twice, and the predicates need
   * not be restated on the outer UPDATE. Only rows this statement RETURNS are
   * ours to act on.
   *
   * `running` is claimable, not excluded. That is the crash recovery: a row
   * whose lease has lapsed was claimed by a tick that never finished, and
   * taking it back is the same operation as taking a fresh one. `attempt_count`
   * bounds that, so a schedule that fails every time cannot loop forever — it
   * runs out of attempts and `failExhaustedSchedules` gives up on it visibly.
   */
  const claimed = (await db.execute(sql`
    UPDATE site_publish_schedules
       SET status = 'running',
           attempt_count = attempt_count + 1,
           lease_expires_at = ${ts(leaseExpiresAt)},
           updated_at = now()
     WHERE id IN (
       SELECT id
         FROM site_publish_schedules
        WHERE status IN ('pending', 'running')
          AND deleted_at IS NULL
          AND scheduled_for <= ${ts(now)}
          AND attempt_count < ${MAX_ATTEMPTS}
          AND (lease_expires_at IS NULL OR lease_expires_at < ${ts(now)})
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
    exhausted: 0,
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
      /*
       * A CURATED sentence, not `message`.
       *
       * `error_message` is read back by the publish sheet and stored in a
       * tenant table, so raw driver text — constraint names, table internals,
       * whatever a connection error carries — must not land in it. The detail
       * is not lost: it is in the console line above, which is where an
       * engineer looks. The PM gets something they can act on.
       */
      await finishSchedule(db, row.id, 'failed', SCHEDULE_FAILURE_MESSAGE).catch(() => {
        // A failure to RECORD the failure must not abort the remaining rows.
      });
      summary.failed += 1;
    }
  }

  /*
   * AFTER the loop, never before.
   *
   * A row this tick just claimed holds a live lease and is deliberately spared
   * by the sweep, so ordering only matters for rows the loop finished: sweeping
   * first would examine them on their pre-run attempt count and could give up
   * on a schedule that was about to succeed. Its own try/catch because losing
   * the sweep must not lose the tick's summary — the claim loop's work is
   * already done and reported by this point.
   */
  try {
    summary.exhausted = (await failExhaustedSchedules(now)).length;
    if (summary.exhausted > 0) {
      console.warn('[scheduled-site-publish] gave up on exhausted schedules', {
        count: summary.exhausted,
      });
    }
  } catch (error) {
    console.error('[scheduled-site-publish] exhausted sweep failed', {
      error: error instanceof Error ? error.message : String(error),
    });
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
           lease_expires_at = NULL,
           updated_at = now()
     WHERE id = ${id}
  `);
}

/**
 * Give up on schedules that have used every attempt, so they stop being
 * invisible.
 *
 * The counterpart to a claimable `running` row. Reclaiming recovers a crash,
 * but a schedule that fails on every attempt would otherwise cycle between
 * `running` and reclaimed forever, and the PM would never learn their notice
 * did not go out. This writes the terminal state the publish sheet reads.
 *
 * One UPDATE, no select — there is nothing to decide per row. A row inside a
 * LIVE lease is spared: it may be mid-flight on its final attempt and about to
 * succeed. `pending` is included alongside `running` for symmetry with the
 * claim predicate; nothing currently returns a row to `pending`, so that arm is
 * defensive rather than load-bearing.
 */
export async function failExhaustedSchedules(now: Date = new Date()): Promise<number[]> {
  const db = createUnscopedClient();
  const result = (await db.execute(sql`
    UPDATE site_publish_schedules
       SET status = 'failed',
           error_message = ${SCHEDULE_EXHAUSTED_MESSAGE},
           executed_at = now(),
           lease_expires_at = NULL,
           updated_at = now()
     WHERE status IN ('pending', 'running')
       AND deleted_at IS NULL
       AND attempt_count >= ${MAX_ATTEMPTS}
       AND (lease_expires_at IS NULL OR lease_expires_at < ${ts(now)})
    RETURNING id
  `)) as unknown as Array<{ id: number }>;

  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<{ id: number }> })?.rows ?? []);
  return rows.map((row) => row.id);
}

