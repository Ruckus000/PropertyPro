/**
 * The cron half of scheduled ("send later") emergency alerts.
 *
 * Scheduling and cancelling live in `emergency-broadcast-service` (they are
 * per-community and use the scoped client). This module is the job that sends
 * what is due, and it follows `site-publish-schedule-service`: a cross-tenant
 * scan, then a conditional UPDATE per row that is the lock.
 *
 * ## One send, never two
 *
 * Vercel Cron delivers at-least-once and a slow tick can overlap the next. The
 * claim is one statement — `SET send_claimed_at = now() WHERE send_claimed_at
 * IS NULL AND canceled_at IS NULL AND send_outcome IS NULL` — and only the
 * tick whose statement returns the row may send it. The scan and the claim also
 * require `completed_at IS NULL`: a draft can be scheduled in place
 * (`scheduleBroadcast`), and an alert that has gone out must never be claimed.
 * Cancel is the mirror image
 * (`cancelBroadcast`), so exactly one of claim and cancel wins.
 *
 * ## No retry
 *
 * Unlike site publishes there is no lease and no second attempt: a send that
 * throws after the claim may already have reached some recipients, and
 * repeating a partial emergency alert is worse than reporting it. The row is
 * marked `failed` / `send_error` and stays claimed. Reasons are a fixed list
 * (`SendOutcomeReason` in `emergency-broadcast-outcome`), never an error's class name or message.
 *
 * ## A claim that never finished
 *
 * If the function dies between the claim and the outcome (a timeout, a
 * deploy), the row is claimed with no outcome and would read "Sending"
 * forever. Each tick first marks such rows `failed` / `interrupted` once the
 * claim is older than `INTERRUPTED_AFTER_MS`. Same rule as any failed send:
 * reported, never retried. This covers an IMMEDIATE send as well: the send
 * route claims its draft the same way (`executeBroadcast`), and those rows
 * have no `scheduled_for`.
 *
 * ## Time budget
 *
 * The route declares `maxDuration` (`CRON_MAX_DURATION_SECONDS`). Once a tick
 * has used `CLAIM_BUDGET_MS` of it, it stops CLAIMING: a row it has not
 * claimed simply waits for the next tick, whereas a row claimed and then cut
 * off by the platform would be marked interrupted and never sent.
 */
import { captureException } from '@sentry/nextjs';
import {
  communities,
  createScopedClient,
  emergencyBroadcastRecipients,
  emergencyBroadcasts,
} from '@propertypro/db';
/*
 * The due-row scan and the claim are deliberately CROSS-TENANT — the job looks
 * for due alerts in every community — so they cannot go through a
 * community-scoped client. The scan and the community lookup only read; the
 * claim's only write is `send_claimed_at` on one row named by id. Everything
 * after the claim uses createScopedClient with the claimed row's community.
 */
// AUTHZ: cross-tenant cron scan + claim behind requireCronSecret; every statement carries its own explicit predicate.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { eq, sql } from '@propertypro/db/filters';
import { isSmsDispatchGloballyEnabled } from '@/lib/sms/dispatch-flag';
import { recordOutcome, sanitizedError } from './emergency-broadcast-outcome';
import {
  executeBroadcast,
  resolveEmergencyRecipients,
  writeBroadcastRecipients,
  type BroadcastAudience,
  type BroadcastChannel,
  type BroadcastSeverity,
} from './emergency-broadcast-service';

/** A scheduled alert found more than this long after its time is not sent. */
export const MISSED_AFTER_MS = 60 * 60 * 1000;

/**
 * A claim this old with no outcome is a send that died part-way. Far longer
 * than a function can run, so a send still in flight is never swept.
 */
export const INTERRUPTED_AFTER_MS = 15 * 60 * 1000;

/** Must equal the route's `maxDuration`; a route test pins the two together. */
export const CRON_MAX_DURATION_SECONDS = 300;

/** Stop claiming new alerts once a tick has run this long (60% of the budget). */
export const CLAIM_BUDGET_MS = CRON_MAX_DURATION_SECONDS * 1000 * 0.6;

/** How many due alerts one cron tick will process. */
const BATCH_SIZE = 25;

export interface ProcessDueScheduledBroadcastsSummary {
  /** Due rows the scan found. */
  due: number;
  sent: number;
  missed: number;
  /**
   * Marked failed, never retried: the send threw after the claim, or the claim
   * never finished (`interrupted`, which this INCLUDES so `withCronJob`, which
   * reports a non-zero `failed`, raises both).
   */
  failed: number;
  /** Due at scan time but claimed by another tick or canceled before our claim. */
  claimedElsewhere: number;
  /** The part of `failed` that was a claim over 15 minutes old with no outcome. */
  interrupted: number;
  /** Due and found, but not claimed because the tick's time budget was spent. Next tick. */
  deferred: number;
}

interface ClaimedRow {
  id: number;
  community_id: number;
  initiated_by: string;
  title: string;
  /** Null for an immediate send, which the interrupted sweep also covers. */
  scheduled_for: Date | string | null;
  severity: string;
  target_audience: string;
  channels: string;
}

/** `db.execute` returns a bare array on this driver, `{ rows }` on others. */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows?: T[] })?.rows ?? [];
}

/** Stored as comma-separated text; older rows may hold a Postgres array literal. */
function parseChannels(raw: unknown): BroadcastChannel[] {
  const parts = Array.isArray(raw) ? raw.map(String) : String(raw ?? '').replace(/[{}"]/g, '').split(',');
  return parts.map((p) => p.trim()).filter((p): p is BroadcastChannel => p === 'sms' || p === 'email');
}

/**
 * Send every scheduled alert whose time has arrived. Called by the cron.
 *
 * A scan or claim error propagates (a real 500, tagged with the job). Anything
 * that goes wrong AFTER a claim is recorded on that row and the loop continues:
 * one community's failure must not stop another community's alert.
 */
export async function processDueScheduledBroadcasts(
  now: Date = new Date(),
  budget: { claimBudgetMs?: number; elapsedMs?: () => number } = {},
): Promise<ProcessDueScheduledBroadcastsSummary> {
  const startedAt = Date.now();
  const elapsedMs = budget.elapsedMs ?? (() => Date.now() - startedAt);
  const claimBudgetMs = budget.claimBudgetMs ?? CLAIM_BUDGET_MS;
  const db = createUnscopedClient();
  const interrupted = await failInterruptedSends(db, now);

  // A raw `sql` template cannot bind a Date on this driver: pass ISO strings.
  const due = rowsOf<{ id: number }>(
    await db.execute(sql`
      SELECT id
        FROM emergency_broadcasts
       WHERE scheduled_for IS NOT NULL
         AND scheduled_for <= ${now.toISOString()}
         AND send_claimed_at IS NULL
         AND canceled_at IS NULL
         AND send_outcome IS NULL
         AND completed_at IS NULL
         AND deleted_at IS NULL
       ORDER BY scheduled_for ASC
       LIMIT ${BATCH_SIZE}
    `),
  );

  const summary: ProcessDueScheduledBroadcastsSummary = {
    due: due.length,
    sent: 0,
    missed: 0,
    failed: interrupted,
    claimedElsewhere: 0,
    interrupted,
    deferred: 0,
  };

  for (const [index, { id }] of due.entries()) {
    // Out of time: leave the rest UNCLAIMED for the next tick (see "Time budget").
    if (elapsedMs() > claimBudgetMs) {
      summary.deferred = due.length - index;
      break;
    }
    const row = rowsOf<ClaimedRow>(
      await db.execute(sql`
        UPDATE emergency_broadcasts
           SET send_claimed_at = now(), updated_at = now()
         WHERE id = ${id}
           AND send_claimed_at IS NULL
           AND canceled_at IS NULL
           AND send_outcome IS NULL
           AND completed_at IS NULL
        RETURNING id, community_id, initiated_by, title, scheduled_for, severity, target_audience, channels
      `),
    )[0];
    if (!row) {
      summary.claimedElsewhere += 1;
      continue;
    }

    const broadcastId = Number(row.id);
    const communityId = Number(row.community_id);
    // The scan selects `scheduled_for IS NOT NULL`, so a due row always has one.
    const scheduledFor = new Date(row.scheduled_for as Date | string);
    // Audit metadata: the title (as the create entry records), never a body or an address.
    const scheduler = {
      title: row.title,
      scheduledBy: row.initiated_by,
      scheduledFor: scheduledFor.toISOString(),
    };

    try {
      const community = (
        await db
          .select({ deletedAt: communities.deletedAt, settings: communities.communitySettings })
          .from(communities)
          .where(eq(communities.id, communityId))
      )[0];

      if (!community || community.deletedAt) {
        await recordOutcome(broadcastId, communityId, 'missed', 'community_deleted', scheduler);
        summary.missed += 1;
        continue;
      }
      // A notice that arrives after the event is worse than none.
      if (now.getTime() - scheduledFor.getTime() > MISSED_AFTER_MS) {
        await recordOutcome(broadcastId, communityId, 'missed', 'late', scheduler);
        summary.missed += 1;
        continue;
      }

      // Recipients and the SMS gate are worked out NOW, not when it was scheduled.
      const smsAllowed =
        isSmsDispatchGloballyEnabled() &&
        (community.settings as Record<string, unknown> | null)?.['smsDispatchEnabled'] === true;
      const recipients = await resolveEmergencyRecipients(
        communityId,
        row.target_audience as BroadcastAudience,
        row.severity as BroadcastSeverity,
      );
      const scoped = createScopedClient(communityId);
      await scoped.update(
        emergencyBroadcasts,
        { recipientCount: recipients.length },
        eq(emergencyBroadcasts.id, broadcastId),
      );
      // Nobody is in the audience any more: there is nothing to send, and it
      // must not read as Sent.
      if (recipients.length === 0) {
        await recordOutcome(broadcastId, communityId, 'missed', 'no_recipients', scheduler);
        summary.missed += 1;
        continue;
      }
      // An alert scheduled from a draft can still hold the draft's recipient
      // rows if `scheduleBroadcast` died before deleting them. We hold the
      // claim, so nothing else writes these rows: clear them, then write the
      // send-time list. Without this the unique (broadcast, user) constraint
      // would fail the send.
      await scoped.hardDelete(
        emergencyBroadcastRecipients,
        eq(emergencyBroadcastRecipients.broadcastId, broadcastId),
      );
      await writeBroadcastRecipients({
        communityId,
        broadcastId,
        recipients,
        channels: parseChannels(row.channels),
        smsAllowed,
        persist: true,
      });

      // The same path as an immediate send: STOP disclosure, recipient cap,
      // delivery tracking and the `emergency_broadcast_sent` audit entry.
      await executeBroadcast(broadcastId, communityId, null, { scheduledBy: row.initiated_by });
      summary.sent += 1;
    } catch (error) {
      summary.failed += 1;
      captureException(sanitizedError(error), {
        tags: { emergency_broadcast: 'scheduled_send_failed' },
        extra: { broadcastId, communityId },
      });
      // A failure to RECORD the failure must not abort the remaining rows.
      await recordOutcome(broadcastId, communityId, 'failed', 'send_error', scheduler).catch(
        (recordError: unknown) => {
          captureException(sanitizedError(recordError), {
            tags: { emergency_broadcast: 'scheduled_outcome_not_recorded' },
            extra: { broadcastId, communityId },
          });
        },
      );
    }
  }

  return summary;
}

/**
 * Mark every claimed alert that never reached an outcome as failed, with the
 * same system audit entry a failed send writes. Returns how many it marked.
 *
 * The scan error propagates like the due-row scan's. A failure to record one
 * row is reported and skipped, so it cannot stop the due alerts from sending;
 * the row is found again on the next tick.
 */
async function failInterruptedSends(
  db: ReturnType<typeof createUnscopedClient>,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - INTERRUPTED_AFTER_MS).toISOString();
  const stale = rowsOf<Pick<ClaimedRow, 'id' | 'community_id' | 'initiated_by' | 'title' | 'scheduled_for'>>(
    await db.execute(sql`
      SELECT id, community_id, initiated_by, title, scheduled_for
        FROM emergency_broadcasts
       WHERE send_claimed_at < ${cutoff}
         AND completed_at IS NULL
         AND canceled_at IS NULL
         AND send_outcome IS NULL
         AND deleted_at IS NULL
       ORDER BY send_claimed_at ASC
       LIMIT ${BATCH_SIZE}
    `),
  );

  let marked = 0;
  for (const row of stale) {
    const broadcastId = Number(row.id);
    const communityId = Number(row.community_id);
    try {
      const recorded = await recordOutcome(broadcastId, communityId, 'failed', 'interrupted', {
        title: row.title,
        scheduledBy: row.initiated_by,
        // Null for an immediate send that died after its claim.
        scheduledFor: row.scheduled_for ? new Date(row.scheduled_for).toISOString() : null,
      });
      if (recorded) marked += 1;
    } catch (error) {
      captureException(sanitizedError(error), {
        tags: { emergency_broadcast: 'scheduled_outcome_not_recorded' },
        extra: { broadcastId, communityId },
      });
    }
  }
  return marked;
}
