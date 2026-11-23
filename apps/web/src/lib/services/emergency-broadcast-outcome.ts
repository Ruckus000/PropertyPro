/**
 * How a send that did not happen, or did not finish, is recorded: the row's
 * terminal outcome, its audit entry, and what Sentry is told.
 *
 * Its own module because both sides need it: the scheduled-send job
 * (`emergency-broadcast-schedule-service`) and the immediate send
 * (`emergency-broadcast-service`), and the job already imports the service.
 */
import { createScopedClient, emergencyBroadcasts, logAuditEvent } from '@propertypro/db';
import { and, eq, isNull } from '@propertypro/db/filters';

/** Every value `send_outcome_reason` can hold. */
export type SendOutcomeReason =
  | 'late'
  | 'community_deleted'
  | 'no_recipients'
  | 'interrupted'
  | 'send_error';

/**
 * What a failed send reports to Sentry in place of the caught error.
 *
 * A database error raised while writing recipient rows can carry a resident's
 * address or phone: drizzle puts the bound values in the message (which
 * `scrubServerEvent` redacts) and postgres.js puts the offending row in
 * `detail` on the error and its `cause` (which nothing redacts). So the
 * original object is never handed over. The report keeps what triage needs:
 * the error's class, its SQLSTATE when it has one, and the call frames, which
 * are code locations. The alert and community ids travel in `extra`.
 */
export function sanitizedError(error: unknown): Error {
  const name = error instanceof Error ? error.constructor.name : 'UnknownError';
  const withCode = (value: unknown): string | null => {
    const code = (value as { code?: unknown } | null)?.code;
    return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : null;
  };
  const sqlState = withCode(error) ?? withCode((error as { cause?: unknown } | null)?.cause);
  const safe = new Error(
    `Emergency alert send failed: ${name}${sqlState ? ` (SQLSTATE ${sqlState})` : ''}`,
  );
  safe.name = 'EmergencyBroadcastSendError';
  const frames =
    error instanceof Error && typeof error.stack === 'string'
      ? error.stack.split('\n').filter((line) => /^\s+at /.test(line))
      : [];
  safe.stack = [`${safe.name}: ${safe.message}`, ...frames].join('\n');
  return safe;
}

/**
 * Write the terminal outcome and its audit entry.
 *
 * Guarded on "no outcome yet and not sent", so a failure after `completed_at`
 * was written cannot relabel a sent alert as failed, and an outcome is never
 * overwritten. The audit entry is written only when the row actually changed;
 * the return value says whether it did.
 *
 * `scheduledFor` decides the entry's wording as well as its metadata: a
 * scheduled alert's entry names who scheduled it and for when; an immediate
 * alert's names who started it and does not mention scheduling at all.
 * `actorUserId` is the manager for an immediate send that failed in their own
 * request, and null (the system actor) for everything the job records.
 */
export async function recordOutcome(
  broadcastId: number,
  communityId: number,
  outcome: 'missed' | 'failed',
  reason: SendOutcomeReason,
  alert: { title: string; scheduledBy: string; scheduledFor: string | null },
  actorUserId: string | null = null,
): Promise<boolean> {
  const updated = await createScopedClient(communityId).update(
    emergencyBroadcasts,
    { sendOutcome: outcome, sendOutcomeReason: reason },
    and(
      eq(emergencyBroadcasts.id, broadcastId),
      isNull(emergencyBroadcasts.sendOutcome),
      isNull(emergencyBroadcasts.completedAt),
    ),
  );
  if (updated.length === 0) return false;

  await logAuditEvent({
    userId: actorUserId,
    action: outcome === 'missed' ? 'emergency_broadcast_missed' : 'emergency_broadcast_failed',
    resourceType: 'emergency_broadcast',
    resourceId: String(broadcastId),
    communityId,
    metadata: alert.scheduledFor
      ? { reason, title: alert.title, scheduledBy: alert.scheduledBy, scheduledFor: alert.scheduledFor }
      : { reason, title: alert.title, initiatedBy: alert.scheduledBy },
  });
  return true;
}
