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
 * tick whose statement returns the row may send it. Cancel is the mirror image
 * (`cancelBroadcast`), so exactly one of claim and cancel wins.
 *
 * ## No retry
 *
 * Unlike site publishes there is no lease and no second attempt: a send that
 * throws after the claim may already have reached some recipients, and
 * repeating a partial emergency alert is worse than reporting it. The row is
 * marked `failed` with the error's class name and stays claimed.
 */
import { captureException } from '@sentry/nextjs';
import { communities, createScopedClient, emergencyBroadcasts, logAuditEvent } from '@propertypro/db';
/*
 * The due-row scan and the claim are deliberately CROSS-TENANT — the job looks
 * for due alerts in every community — so they cannot go through a
 * community-scoped client. The scan and the community lookup only read; the
 * claim's only write is `send_claimed_at` on one row named by id. Everything
 * after the claim uses createScopedClient with the claimed row's community.
 */
// AUTHZ: cross-tenant cron scan + claim behind requireCronSecret; every statement carries its own explicit predicate.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { and, eq, isNull, sql } from '@propertypro/db/filters';
import { isSmsDispatchGloballyEnabled } from '@/lib/sms/dispatch-flag';
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

/** How many due alerts one cron tick will process. */
const BATCH_SIZE = 25;

export interface ProcessDueScheduledBroadcastsSummary {
  /** Due rows the scan found. */
  due: number;
  sent: number;
  missed: number;
  /** Claimed, then the send threw. Marked failed; never retried. */
  failed: number;
  /** Due at scan time but claimed by another tick or canceled before our claim. */
  claimedElsewhere: number;
}

interface ClaimedRow {
  id: number;
  community_id: number;
  initiated_by: string;
  title: string;
  scheduled_for: Date | string;
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
): Promise<ProcessDueScheduledBroadcastsSummary> {
  const db = createUnscopedClient();

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
         AND deleted_at IS NULL
       ORDER BY scheduled_for ASC
       LIMIT ${BATCH_SIZE}
    `),
  );

  const summary: ProcessDueScheduledBroadcastsSummary = {
    due: due.length,
    sent: 0,
    missed: 0,
    failed: 0,
    claimedElsewhere: 0,
  };

  for (const { id } of due) {
    const row = rowsOf<ClaimedRow>(
      await db.execute(sql`
        UPDATE emergency_broadcasts
           SET send_claimed_at = now(), updated_at = now()
         WHERE id = ${id}
           AND send_claimed_at IS NULL
           AND canceled_at IS NULL
           AND send_outcome IS NULL
        RETURNING id, community_id, initiated_by, title, scheduled_for, severity, target_audience, channels
      `),
    )[0];
    if (!row) {
      summary.claimedElsewhere += 1;
      continue;
    }

    const broadcastId = Number(row.id);
    const communityId = Number(row.community_id);
    const scheduledFor = new Date(row.scheduled_for);
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
      await createScopedClient(communityId).update(
        emergencyBroadcasts,
        { recipientCount: recipients.length },
        eq(emergencyBroadcasts.id, broadcastId),
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
      // The class name only: an error message can carry an address or a body.
      const reason = error instanceof Error ? error.constructor.name : 'UnknownError';
      captureException(error, {
        tags: { emergency_broadcast: 'scheduled_send_failed' },
        extra: { broadcastId, communityId },
      });
      // A failure to RECORD the failure must not abort the remaining rows.
      await recordOutcome(broadcastId, communityId, 'failed', reason, scheduler).catch(
        (recordError: unknown) => {
          captureException(recordError, {
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
 * Write the terminal outcome and its audit entry (system actor; the scheduler
 * is named in metadata).
 *
 * Guarded on "no outcome yet and not sent", so a failure after `completed_at`
 * was written cannot relabel a sent alert as failed, and an outcome is never
 * overwritten. The audit entry is written only when the row actually changed.
 */
async function recordOutcome(
  broadcastId: number,
  communityId: number,
  outcome: 'missed' | 'failed',
  reason: string,
  scheduler: { title: string; scheduledBy: string; scheduledFor: string },
): Promise<void> {
  const updated = await createScopedClient(communityId).update(
    emergencyBroadcasts,
    { sendOutcome: outcome, sendOutcomeReason: reason },
    and(
      eq(emergencyBroadcasts.id, broadcastId),
      isNull(emergencyBroadcasts.sendOutcome),
      isNull(emergencyBroadcasts.completedAt),
    ),
  );
  if (updated.length === 0) return;

  await logAuditEvent({
    userId: null,
    action: outcome === 'missed' ? 'emergency_broadcast_missed' : 'emergency_broadcast_failed',
    resourceType: 'emergency_broadcast',
    resourceId: String(broadcastId),
    communityId,
    metadata: { reason, ...scheduler },
  });
}
