/**
 * Emergency Broadcast Service — core orchestration for Phase 1B.
 *
 * Handles broadcast creation, recipient resolution, SMS + email dispatch,
 * delivery status tracking, and cancellation with undo window.
 *
 * Key design decisions:
 * - Emergency broadcasts bypass subscription guard (life-safety over revenue)
 * - Emergency emails bypass digest mode (always immediate)
 * - SMS failure does NOT block email delivery (and vice versa)
 * - Phone numbers masked in audit logs (PII protection)
 * - Per-recipient delivery tracking for full observability
 */

import { createElement } from 'react';
import {
  clampPageSize,
  communities,
  createScopedClient,
  emergencyBroadcastRecipients,
  emergencyBroadcasts,
  logAuditEvent,
  notificationPreferences,
  paginate,
  userRoles,
  users,
} from '@propertypro/db';
import type {
  Community,
  EmergencyBroadcast,
  EmergencyBroadcastRecipient,
  NotificationPreference,
  User,
  UserRoleRecord,
} from '@propertypro/db';
import { eq, and, desc, gte, inArray, isNotNull, isNull, type SQL } from '@propertypro/db/filters';
import { EmergencyAlertEmail, sendBulkEmail } from '@propertypro/email';
import type { EmergencyAlertSeverity } from '@propertypro/email';
import {
  SMS_MAX_LENGTH,
  appendStopDisclosure,
  severityRequiresStopDisclosure,
} from '@/lib/services/sms/sms-keyword';
import { normalizeToE164, isValidE164, maskPhone } from '@/lib/utils/phone';
import { chunk } from '@/lib/utils/chunk';
import { sendBulkEmergencySms } from '@/lib/services/sms/sms-service';
import { isStatusAdvancement } from '@/lib/services/sms/sms-types';
import type { SmsDeliveryStatus } from '@/lib/services/sms/sms-types';
import { getBaseUrl } from '@/lib/utils/url';
import { ConflictError, ValidationError } from '@/lib/api/errors';
import { captureException } from '@sentry/nextjs';
import { recordOutcome, sanitizedError } from './emergency-broadcast-outcome';

// ── Types ───────────────────────────────────────────────────────────────────

export type BroadcastAudience = 'all' | 'owners_only';

export type BroadcastSeverity = 'emergency' | 'urgent' | 'info';

export type BroadcastChannel = 'sms' | 'email';

export interface CreateBroadcastParams {
  communityId: number;
  title: string;
  body: string;
  smsBody?: string;
  severity: BroadcastSeverity;
  templateKey?: string;
  targetAudience: BroadcastAudience;
  channels: BroadcastChannel[];
  /**
   * Whether the SMS legal gate permits texting for this community — BOTH the
   * global SMS_DISPATCH_ENABLED floor and the per-community `smsDispatchEnabled`
   * flag. Passed in by the caller rather than resolved here: the only caller is
   * the create route, which already holds the membership, so reading it here
   * would be a redundant query AND would drag the unscoped DB client into a
   * service whose tests do not otherwise need one.
   *
   * REQUIRED, not optional-defaulting-to-false: a silent default would make a
   * forgotten argument look like a working email-only broadcast.
   * See docs/audits/2026-08-09-legal-risk-audit.md F-10.
   */
  smsAllowed: boolean;
  initiatedBy: string;
  /**
   * Set means "send later": the broadcast is stored with no recipient rows and
   * the scheduled-emergency-broadcasts cron sends it. Must be 5 minutes to 365
   * days ahead (`assertSchedulableTime`).
   */
  scheduledFor?: Date;
}

export interface CreateBroadcastResult {
  broadcastId: number;
  recipientCount: number;
  smsEligibleCount: number;
  emailCount: number;
  /** ISO time the alert will send. Present only for a scheduled broadcast. */
  scheduledFor?: string;
}

export interface BroadcastWithReport {
  id: number;
  communityId: number;
  title: string;
  body: string;
  smsBody: string | null;
  severity: string;
  templateKey: string | null;
  targetAudience: string;
  channels: string[];
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  initiatedBy: string;
  initiatedAt: Date;
  completedAt: Date | null;
  canceledAt: Date | null;
  /** Set for a "send later" alert. */
  scheduledFor: Date | null;
  /** Set once the cron has started sending; a claimed alert cannot be canceled. */
  sendClaimedAt: Date | null;
  /** Why a scheduled alert did not send: 'missed' | 'failed'. */
  sendOutcome: string | null;
  /** One of 'late', 'community_deleted', 'no_recipients', 'interrupted', 'send_error'. */
  sendOutcomeReason: string | null;
  recipients: RecipientStatus[];
}

export interface RecipientStatus {
  userId: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  smsStatus: string;
  emailStatus: string;
  smsSentAt: Date | null;
  smsDeliveredAt: Date | null;
  emailSentAt: Date | null;
}

export interface ResolvedRecipient {
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  phoneVerified: boolean;
  smsConsented: boolean;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Undo window duration in milliseconds (10 seconds) */
const UNDO_WINDOW_MS = 10_000;
export const MAX_BROADCAST_RECIPIENTS = 500;

/**
 * Refuse to SCHEDULE an alert whose audience is over the per-alert cap. The
 * send path enforces the cap too, but a scheduled alert sends unattended, so
 * the manager has to hear it now, while they can still change the audience.
 */
function assertSchedulableAudience(recipientCount: number): void {
  if (recipientCount > MAX_BROADCAST_RECIPIENTS) {
    throw new ValidationError(
      `This alert would go to ${recipientCount} people, and one alert can reach at most ${MAX_BROADCAST_RECIPIENTS}. Choose a smaller audience and schedule it again.`,
    );
  }
}

/** A scheduled alert must be at least this far ahead (the cron runs every 5 minutes). */
export const MIN_SCHEDULE_LEAD_MS = 5 * 60 * 1000;
/** ...and at most this far ahead. */
export const MAX_SCHEDULE_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;

// ── Helpers ─────────────────────────────────────────────────────────────────

function isAudienceMatch(
  role: string,
  audience: BroadcastAudience,
  opts?: { isUnitOwner?: boolean },
): boolean {
  if (audience === 'all') return true;
  if (audience === 'owners_only') return role === 'resident' && opts?.isUnitOwner === true;
  return false;
}

/** Refuse a send-later time outside the 5-minute to 365-day window. */
export function assertSchedulableTime(scheduledFor: Date, now: Date = new Date()): void {
  const ahead = scheduledFor.getTime() - now.getTime();
  // NaN (an unparseable date) fails both comparisons, so it is refused here too.
  if (!(ahead >= MIN_SCHEDULE_LEAD_MS)) {
    throw new ValidationError('Choose a time at least 5 minutes from now.', {
      fields: [{ field: 'scheduledFor', message: 'Must be at least 5 minutes from now.' }],
    });
  }
  if (ahead > MAX_SCHEDULE_AHEAD_MS) {
    throw new ValidationError('Choose a time within the next 365 days.', {
      fields: [{ field: 'scheduledFor', message: 'Must be within the next 365 days.' }],
    });
  }
}

/**
 * Write one recipient row per resolved recipient and return the per-channel
 * counts. With `persist: false` only the counts are computed — a scheduled
 * broadcast stores no recipient rows until it sends.
 *
 * The SMS legal gate is applied HERE rather than on the route, and it DEGRADES
 * rather than refuses: an admin who selected both channels still gets the email
 * broadcast out. A route-level 403 would kill the email leg too, which would
 * invert this feature's whole premise ("life-safety over revenue" — see the
 * header comment on api/v1/emergency-broadcasts/route.ts). With SMS off every
 * recipient is written `smsStatus: 'skipped'` with a null phone, so
 * `executeBroadcast` finds nothing pending and the SMS path is never entered.
 * See docs/audits/2026-08-09-legal-risk-audit.md F-10.
 */
export async function writeBroadcastRecipients(params: {
  communityId: number;
  broadcastId: number;
  recipients: ResolvedRecipient[];
  channels: BroadcastChannel[];
  smsAllowed: boolean;
  persist: boolean;
}): Promise<{ smsEligibleCount: number; emailCount: number }> {
  const scoped = createScopedClient(params.communityId);
  const smsEnabled = params.channels.includes('sms') && params.smsAllowed;
  const emailEnabled = params.channels.includes('email');

  let smsEligibleCount = 0;
  let emailCount = 0;

  for (const batch of chunk(params.recipients, 50)) {
    const rows = batch.map((r) => {
      const canReceiveSms = smsEnabled && r.phoneVerified && r.smsConsented && r.phone !== null;
      const canReceiveEmail = emailEnabled && r.email !== null;

      if (canReceiveSms) smsEligibleCount++;
      if (canReceiveEmail) emailCount++;

      return {
        broadcastId: params.broadcastId,
        userId: r.userId,
        email: canReceiveEmail ? r.email : null,
        phone: canReceiveSms ? r.phone : null,
        smsStatus: canReceiveSms ? 'pending' : 'skipped',
        emailStatus: canReceiveEmail ? 'pending' : 'skipped',
      };
    });
    if (params.persist) await scoped.insert(emergencyBroadcastRecipients, rows);
  }

  return { smsEligibleCount, emailCount };
}

// ── Core service functions ──────────────────────────────────────────────────

/**
 * Create a broadcast draft and resolve recipients.
 *
 * Does NOT send anything — the broadcast stays in draft state until
 * executeBroadcast() is called. Returns the broadcast with recipient count
 * for the confirmation UI.
 *
 * With `scheduledFor` the broadcast is SCHEDULED instead: no recipient rows are
 * written (recipients are worked out when it sends), the counts returned are
 * "as of now", and the scheduled-emergency-broadcasts cron sends it.
 *
 * Does NOT call requireActiveSubscriptionForMutation() — life-safety bypass.
 */
export async function createBroadcast(
  params: CreateBroadcastParams,
): Promise<CreateBroadcastResult> {
  const scheduledFor = params.scheduledFor;
  if (scheduledFor) assertSchedulableTime(scheduledFor);

  const scoped = createScopedClient(params.communityId);

  // Resolve recipients (batch query — no N+1)
  const resolved = await resolveEmergencyRecipients(params.communityId, params.targetAudience, params.severity);
  if (scheduledFor) assertSchedulableAudience(resolved.length);

  // Create broadcast record
  const broadcastRows = await scoped.insert(emergencyBroadcasts, {
    title: params.title,
    body: params.body,
    smsBody: params.smsBody ?? null,
    severity: params.severity,
    templateKey: params.templateKey ?? null,
    targetAudience: params.targetAudience,
    channels: params.channels,
    recipientCount: resolved.length,
    sentCount: 0,
    deliveredCount: 0,
    failedCount: 0,
    initiatedBy: params.initiatedBy,
    initiatedAt: new Date(),
    ...(scheduledFor ? { scheduledFor } : {}),
  });

  const broadcastId = Number(broadcastRows[0]?.['id']);
  if (!broadcastId) throw new Error('Failed to create broadcast record');

  // Create recipient rows (immediate), or only count them (scheduled).
  const { smsEligibleCount, emailCount } = await writeBroadcastRecipients({
    communityId: params.communityId,
    broadcastId,
    recipients: resolved,
    channels: params.channels,
    smsAllowed: params.smsAllowed,
    persist: !scheduledFor,
  });

  // Audit log (phone numbers masked)
  await logAuditEvent({
    userId: params.initiatedBy,
    action: scheduledFor ? 'emergency_broadcast_scheduled' : 'emergency_broadcast_created',
    resourceType: 'emergency_broadcast',
    resourceId: String(broadcastId),
    communityId: params.communityId,
    metadata: {
      title: params.title,
      severity: params.severity,
      targetAudience: params.targetAudience,
      channels: params.channels,
      recipientCount: resolved.length,
      smsEligibleCount,
      emailCount,
      ...(scheduledFor ? { scheduledFor: scheduledFor.toISOString() } : {}),
    },
  });

  return {
    broadcastId,
    recipientCount: resolved.length,
    smsEligibleCount,
    emailCount,
    ...(scheduledFor ? { scheduledFor: scheduledFor.toISOString() } : {}),
  };
}

/**
 * Turn the draft the composer created into a scheduled ("send later") alert,
 * in place: no second broadcast row is written.
 *
 * ONE conditional UPDATE is the whole decision. It matches only a draft that
 * has not been sent, canceled, scheduled or claimed, so of two concurrent
 * requests (two schedules, or a schedule racing a send's completion or a
 * cancel) at most one schedule wins; the loser gets a 409.
 *
 * Then the draft's pre-resolved recipient rows are deleted, because recipients
 * are worked out again when the alert sends. `recipient_count` is left as the
 * "as of now" count the manager was shown.
 *
 * ## If the request dies between the two statements
 *
 * The alert is scheduled and still has its draft recipient rows. That is safe:
 * the job replaces a claimed alert's recipient rows before sending
 * (`processDueScheduledBroadcasts`), so the stale rows are never sent to and
 * the unique (broadcast, user) constraint cannot fail the send. Until then
 * they are invisible: no delivery report is drawn for an unsent alert.
 */
export async function scheduleBroadcast(
  broadcastId: number,
  communityId: number,
  userId: string,
  scheduledFor: Date,
): Promise<{ scheduled: true; scheduledFor: string }> {
  assertSchedulableTime(scheduledFor);

  const scoped = createScopedClient(communityId);
  // Read only to refuse an over-cap audience before anything is written; the
  // UPDATE below, not this read, decides whether the draft can be scheduled.
  const draft = (
    await scoped.selectFrom<EmergencyBroadcast>(
      emergencyBroadcasts, {}, eq(emergencyBroadcasts.id, broadcastId),
    )
  )[0];
  if (draft) assertSchedulableAudience(draft.recipientCount);

  const converted = await scoped.update(
    emergencyBroadcasts,
    { scheduledFor },
    and(
      eq(emergencyBroadcasts.id, broadcastId),
      isNull(emergencyBroadcasts.canceledAt),
      isNull(emergencyBroadcasts.completedAt),
      isNull(emergencyBroadcasts.scheduledFor),
      isNull(emergencyBroadcasts.sendClaimedAt),
    ),
  );
  const broadcast = converted[0] as EmergencyBroadcast | undefined;
  if (!broadcast) {
    throw new ConflictError('This alert has already been sent, scheduled or canceled.');
  }

  const draftRecipients = await scoped.hardDelete(
    emergencyBroadcastRecipients,
    eq(emergencyBroadcastRecipients.broadcastId, broadcastId),
  );

  // The same entry `createBroadcast` writes when it schedules.
  await logAuditEvent({
    userId,
    action: 'emergency_broadcast_scheduled',
    resourceType: 'emergency_broadcast',
    resourceId: String(broadcastId),
    communityId,
    metadata: {
      title: broadcast.title,
      severity: broadcast.severity,
      targetAudience: broadcast.targetAudience,
      channels: broadcast.channels,
      recipientCount: broadcast.recipientCount,
      smsEligibleCount: draftRecipients.filter((r) => r['smsStatus'] === 'pending').length,
      emailCount: draftRecipients.filter((r) => r['emailStatus'] === 'pending').length,
      scheduledFor: scheduledFor.toISOString(),
    },
  });

  return { scheduled: true, scheduledFor: scheduledFor.toISOString() };
}

/**
 * Execute a broadcast — sends SMS + email in parallel.
 *
 * SMS and email are independent: one failing does not block the other.
 * Sets completedAt when all sends are initiated (delivery is async via webhooks).
 *
 * A scheduled broadcast is sent ONLY by the scheduled-emergency-broadcasts
 * cron, which passes `scheduledSend` after winning the row's atomic claim.
 * Without it a scheduled broadcast is refused — claimed or not — so a manager's
 * "send" can never double a send the cron owns. The cron's send has no acting
 * user (`userId` null, the system actor); the scheduler is named in metadata.
 *
 * ## The immediate send takes a claim too
 *
 * Without `scheduledSend` this function first claims the draft in ONE
 * conditional UPDATE (`send_claimed_at`, only while the draft is unscheduled,
 * unclaimed, unsent and uncanceled) and sends only if that statement returned
 * the row. `scheduleBroadcast` and `cancelBroadcast` are guarded on
 * `send_claimed_at IS NULL`, so of send / schedule / cancel on one draft
 * exactly one wins, and two sends (a double click) send once. A loser gets a
 * 409 and has changed nothing.
 *
 * Everything that can refuse the send (the recipient cap) runs BEFORE the
 * claim. After it, a send that dies leaves the row claimed with no result; the
 * cron's 15-minute sweep marks it failed / `interrupted`, exactly as for a
 * scheduled send, and like one it is never retried. A send that THROWS after
 * the claim does not wait for the sweep: it is marked failed / `send_error`
 * at once (and reported, sanitised), then the error is rethrown.
 */
export async function executeBroadcast(
  broadcastId: number,
  communityId: number,
  userId: string | null,
  scheduledSend?: { scheduledBy: string },
): Promise<{ smsQueued: number; emailSent: number }> {
  // Set once the immediate path holds the claim: from then on a throw is a
  // send that failed part-way, not a refusal.
  const claim: { held: { title: string; initiatedBy: string } | null } = { held: null };
  try {
    return await sendBroadcast(broadcastId, communityId, userId, scheduledSend, (claimed) => {
      claim.held = claimed;
    });
  } catch (error) {
    // The job records its own failures (it owns the claim on a scheduled alert).
    if (scheduledSend || !claim.held) throw error;
    // Say so NOW rather than leave the alert reading "Sending" until the
    // 15-minute sweep: mark it failed / send_error, exactly as the job would.
    // The sweep is then only for a function that died without reaching here.
    const failure = { broadcastId, communityId };
    captureException(sanitizedError(error), {
      tags: { emergency_broadcast: 'immediate_send_failed' },
      extra: failure,
    });
    await recordOutcome(
      broadcastId,
      communityId,
      'failed',
      'send_error',
      { title: claim.held.title, scheduledBy: claim.held.initiatedBy, scheduledFor: null },
      userId,
    ).catch((recordError: unknown) => {
      captureException(sanitizedError(recordError), {
        tags: { emergency_broadcast: 'immediate_outcome_not_recorded' },
        extra: failure,
      });
    });
    // The route still answers with the original error.
    throw error;
  }
}

async function sendBroadcast(
  broadcastId: number,
  communityId: number,
  userId: string | null,
  scheduledSend: { scheduledBy: string } | undefined,
  onImmediateClaim: (claimed: { title: string; initiatedBy: string }) => void,
): Promise<{ smsQueued: number; emailSent: number }> {
  const scoped = createScopedClient(communityId);

  // Load broadcast
  const broadcastRows = await scoped.selectFrom<EmergencyBroadcast>(
    emergencyBroadcasts, {}, eq(emergencyBroadcasts.id, broadcastId),
  );
  const broadcast = broadcastRows[0];
  if (!broadcast) throw new Error('Broadcast not found');
  if (broadcast.canceledAt) throw new Error('Broadcast was canceled');
  if (broadcast.completedAt) throw new Error('Broadcast already sent');
  if (broadcast.scheduledFor && !scheduledSend) {
    throw new ConflictError(
      'This alert is scheduled and will be sent automatically at its scheduled time.',
    );
  }

  // Load recipients
  const recipients = await scoped.selectFrom<EmergencyBroadcastRecipient>(
    emergencyBroadcastRecipients, {}, eq(emergencyBroadcastRecipients.broadcastId, broadcastId),
  );
  if (recipients.length > MAX_BROADCAST_RECIPIENTS) {
    throw new Error(
      `Broadcast exceeds maximum recipient limit of ${MAX_BROADCAST_RECIPIENTS}`,
    );
  }

  // If no explicit smsBody, fall back to body. Truncation to the 1600-char
  // multi-part limit now happens INSIDE `appendStopDisclosure`, which reserves
  // room for the notice first — appending after truncating can exceed the
  // limit, and truncating after appending cuts off the disclosure itself, which
  // is the one part that has to survive (F-10).
  const severity = broadcast.severity;
  const rawSmsBody = broadcast.smsBody ?? broadcast.body;
  const smsBody = severityRequiresStopDisclosure(severity)
    ? appendStopDisclosure(rawSmsBody)
    : rawSmsBody.length > SMS_MAX_LENGTH
      ? `${rawSmsBody.slice(0, SMS_MAX_LENGTH - 3)}...`
      : rawSmsBody;
  const emailBody = broadcast.body;
  const title = broadcast.title;

  // Load community name for email
  const communityRows = await scoped.selectFrom<Community>(
    communities, {}, eq(communities.id, communityId),
  );
  const communityName = communityRows[0]?.name ?? 'PropertyPro';

  if (!scheduledSend) {
    const claimed = await scoped.update(
      emergencyBroadcasts,
      { sendClaimedAt: new Date() },
      and(
        eq(emergencyBroadcasts.id, broadcastId),
        isNull(emergencyBroadcasts.scheduledFor),
        isNull(emergencyBroadcasts.sendClaimedAt),
        isNull(emergencyBroadcasts.completedAt),
        isNull(emergencyBroadcasts.canceledAt),
      ),
    );
    if (claimed.length === 0) {
      throw new ConflictError(
        'This alert is already being sent, or has been sent, scheduled or canceled.',
      );
    }
    onImmediateClaim({ title: broadcast.title, initiatedBy: broadcast.initiatedBy });
  }

  const statusCallbackUrl = `${getBaseUrl()}/api/v1/webhooks/twilio`;
  // Single timestamp shared across the entire batch so all `sentAt` /
  // `emailSentAt` / `smsSentAt` columns line up exactly.
  const sentAt = new Date();

  // ── Send SMS + Email in parallel ────────────────────────────────────────

  const smsRecipients = recipients.filter(
    (r) => r.smsStatus === 'pending' && r.phone != null,
  );
  const emailRecipients = recipients.filter(
    (r) => r.emailStatus === 'pending' && r.email != null,
  );

  const [smsResult, emailResult] = await Promise.allSettled([
    // SMS sending
    (async () => {
      if (smsRecipients.length === 0) return 0;

      const bulkResult = await sendBulkEmergencySms({
        recipients: smsRecipients.map((r) => ({
          userId: r.userId,
          phone: r.phone!,
        })),
        body: smsBody,
        statusCallbackUrl,
      });

      // Update per-recipient SMS status
      for (const [recipientUserId, result] of bulkResult.results) {
        await scoped.update(
          emergencyBroadcastRecipients,
          {
            smsStatus: result.status,
            smsProviderSid: result.providerMessageId,
            smsErrorCode: result.errorCode,
            smsErrorMessage: result.errorMessage,
            smsSentAt: result.success ? sentAt : null,
          },
          and(
            eq(emergencyBroadcastRecipients.broadcastId, broadcastId),
            eq(emergencyBroadcastRecipients.userId, recipientUserId),
          ),
        );
      }

      return bulkResult.successCount;
    })(),

    // Email sending
    (async () => {
      if (emailRecipients.length === 0) return 0;

      const emailPayloads = emailRecipients.map((recipient) => ({
        to: recipient.email!,
        subject: `🚨 ${title}`,
        category: 'transactional' as const,
        react: createElement(EmergencyAlertEmail, {
          branding: { communityName },
          recipientName: '',
          alertTitle: title,
          alertBody: emailBody,
          severity: severity as EmergencyAlertSeverity,
          sentAt: sentAt.toISOString(),
        }),
      }));

      const bulkResult = await sendBulkEmail(emailPayloads);

      // We assume bulkResult.results maps 1:1 with emailRecipients in order
      const successfulIds: string[] = [];
      const failedIds: string[] = [];
      const providerIdsMap = new Map<string, string>();

      for (let i = 0; i < emailRecipients.length; i++) {
        const recipient = emailRecipients[i];
        if (!recipient) continue;

        const result = bulkResult.results[i];

        if (result && result.success) {
          successfulIds.push(recipient.userId);
          if (result.id) providerIdsMap.set(recipient.userId, result.id);
        } else {
          failedIds.push(recipient.userId);
        }
      }

      // Batch update successful queries
      // We will perform individual updates for success to record provider IDs, but they can be parallelized in chunks.
      if (successfulIds.length > 0) {
        for (const batch of chunk(successfulIds, 50)) {
          await Promise.all(
            batch.map((userId) =>
              scoped.update(
                emergencyBroadcastRecipients,
                {
                  emailStatus: 'sent',
                  emailProviderId: providerIdsMap.get(userId),
                  emailSentAt: sentAt,
                },
                and(
                  eq(emergencyBroadcastRecipients.broadcastId, broadcastId),
                  eq(emergencyBroadcastRecipients.userId, userId),
                )
              )
            )
          );
        }
      }

      // Batch update failures using inArray to reduce N+1 updates
      if (failedIds.length > 0) {
        for (const batch of chunk(failedIds, 50)) {
          if (batch.length > 0) {
            await scoped.update(
              emergencyBroadcastRecipients,
              { emailStatus: 'failed' },
              and(
                eq(emergencyBroadcastRecipients.broadcastId, broadcastId),
                inArray(emergencyBroadcastRecipients.userId, batch),
              )
            );
          }
        }
      }

      return bulkResult.successCount;
    })(),
  ]);

  const smsQueued = smsResult.status === 'fulfilled' ? smsResult.value : 0;
  const emailSent = emailResult.status === 'fulfilled' ? emailResult.value : 0;

  // Mark broadcast as completed
  await scoped.update(
    emergencyBroadcasts,
    {
      completedAt: new Date(),
      sentCount: smsQueued + emailSent,
    },
    eq(emergencyBroadcasts.id, broadcastId),
  );

  // Audit log
  await logAuditEvent({
    userId,
    action: 'emergency_broadcast_sent',
    resourceType: 'emergency_broadcast',
    resourceId: String(broadcastId),
    communityId,
    metadata: {
      smsQueued,
      emailSent,
      totalRecipients: recipients.length,
      ...(scheduledSend && broadcast.scheduledFor
        ? {
            scheduledBy: scheduledSend.scheduledBy,
            scheduledFor: broadcast.scheduledFor.toISOString(),
          }
        : {}),
    },
  });

  return { smsQueued, emailSent };
}

/**
 * Cancel a broadcast.
 *
 * An immediate broadcast can be canceled within the undo window (10 seconds).
 * A scheduled broadcast can be canceled any time before the cron claims it.
 *
 * Either way the cancel is ONE conditional UPDATE guarded on "not claimed, not
 * sent, not canceled", so a cancel racing a send's claim or a schedule has one
 * winner. The read before it only words the refusals; it decides nothing.
 *
 * Returns true if successfully canceled; false if the undo window expired, the
 * alert has started sending (or been missed), or another request got there first.
 */
export async function cancelBroadcast(
  broadcastId: number,
  communityId: number,
  userId: string,
): Promise<boolean> {
  const scoped = createScopedClient(communityId);

  const broadcastRows = await scoped.selectFrom<EmergencyBroadcast>(
    emergencyBroadcasts, {}, eq(emergencyBroadcasts.id, broadcastId),
  );
  const broadcast = broadcastRows[0];
  if (!broadcast) throw new Error('Broadcast not found');
  if (broadcast.canceledAt) throw new Error('Broadcast already canceled');
  if (broadcast.completedAt) throw new Error('Broadcast already sent — cannot cancel');

  if (broadcast.scheduledFor) {
    // ONE statement, atomic against the cron's claim: whichever of the two
    // UPDATEs commits first makes the other match no row. No recipient rows
    // exist yet, so there is nothing else to undo.
    const won = await scoped.update(
      emergencyBroadcasts,
      { canceledAt: new Date() },
      and(
        eq(emergencyBroadcasts.id, broadcastId),
        isNull(emergencyBroadcasts.sendClaimedAt),
        isNull(emergencyBroadcasts.canceledAt),
        isNull(emergencyBroadcasts.sendOutcome),
      ),
    );
    if (won.length === 0) return false;

    await logAuditEvent({
      userId,
      action: 'emergency_broadcast_canceled',
      resourceType: 'emergency_broadcast',
      resourceId: String(broadcastId),
      communityId,
      metadata: { scheduledFor: broadcast.scheduledFor.toISOString() },
    });
    return true;
  }

  // Check undo window
  const initiatedAt = broadcast.initiatedAt;
  if (!(initiatedAt instanceof Date)) throw new Error('Invalid broadcast initiation time');

  const elapsed = Date.now() - initiatedAt.getTime();
  if (elapsed > UNDO_WINDOW_MS) {
    return false; // Undo window expired
  }

  const won = await scoped.update(
    emergencyBroadcasts,
    { canceledAt: new Date() },
    and(
      eq(emergencyBroadcasts.id, broadcastId),
      isNull(emergencyBroadcasts.canceledAt),
      isNull(emergencyBroadcasts.completedAt),
      isNull(emergencyBroadcasts.sendClaimedAt),
      // Not scheduled since the read above: a scheduled alert takes the branch above.
      isNull(emergencyBroadcasts.scheduledFor),
      gte(emergencyBroadcasts.initiatedAt, new Date(Date.now() - UNDO_WINDOW_MS)),
    ),
  );
  if (won.length === 0) return false;

  // Mark all pending recipients as skipped
  const pendingRecipients = await scoped.selectFrom<EmergencyBroadcastRecipient>(
    emergencyBroadcastRecipients, {},
    eq(emergencyBroadcastRecipients.broadcastId, broadcastId),
  );

  for (const recipient of pendingRecipients) {
    if (recipient.smsStatus !== 'pending' && recipient.emailStatus !== 'pending') continue;

    await scoped.update(
      emergencyBroadcastRecipients,
      {
        smsStatus: recipient.smsStatus === 'pending' ? 'skipped' : recipient.smsStatus,
        emailStatus: recipient.emailStatus === 'pending' ? 'skipped' : recipient.emailStatus,
      },
      and(
        eq(emergencyBroadcastRecipients.broadcastId, broadcastId),
        eq(emergencyBroadcastRecipients.userId, recipient.userId),
      ),
    );
  }

  await logAuditEvent({
    userId,
    action: 'emergency_broadcast_canceled',
    resourceType: 'emergency_broadcast',
    resourceId: String(broadcastId),
    communityId,
  });

  return true;
}

/**
 * Update SMS status for a specific recipient (called after webhook resolves the recipient).
 */
export async function updateRecipientSmsStatusByIds(
  communityId: number,
  broadcastId: number,
  recipientUserId: string,
  newStatus: SmsDeliveryStatus,
  errorCode?: string,
  errorMessage?: string,
): Promise<void> {
  const scoped = createScopedClient(communityId);

  // Get current status
  const recipientRows = await scoped.selectFrom<EmergencyBroadcastRecipient>(
    emergencyBroadcastRecipients, {},
    and(
      eq(emergencyBroadcastRecipients.broadcastId, broadcastId),
      eq(emergencyBroadcastRecipients.userId, recipientUserId),
    ),
  );
  const recipient = recipientRows[0];
  if (!recipient) return;

  const currentStatus = recipient.smsStatus as SmsDeliveryStatus;
  if (!isStatusAdvancement(currentStatus, newStatus)) return; // Idempotent: don't go backward

  const updateData: Record<string, unknown> = { smsStatus: newStatus };
  if (newStatus === 'delivered') {
    updateData['smsDeliveredAt'] = new Date();
  }
  if (errorCode) {
    updateData['smsErrorCode'] = errorCode;
    updateData['smsErrorMessage'] = errorMessage ?? null;
  }

  await scoped.update(
    emergencyBroadcastRecipients,
    updateData,
    and(
      eq(emergencyBroadcastRecipients.broadcastId, broadcastId),
      eq(emergencyBroadcastRecipients.userId, recipientUserId),
    ),
  );

  // Update aggregate counts on broadcast
  await updateBroadcastAggregates(communityId, broadcastId);
}

/**
 * Recalculate and update aggregate delivery counts on a broadcast.
 *
 * Counts SMS and email channels independently:
 * - deliveredCount: SMS confirmed delivered to handset
 * - sentCount: SMS accepted by provider + email accepted by Resend
 * - failedCount: SMS or email permanently failed
 */
async function updateBroadcastAggregates(
  communityId: number,
  broadcastId: number,
): Promise<void> {
  const scoped = createScopedClient(communityId);

  const recipients = await scoped.selectFrom<EmergencyBroadcastRecipient>(
    emergencyBroadcastRecipients, {},
    eq(emergencyBroadcastRecipients.broadcastId, broadcastId),
  );

  let deliveredCount = 0;
  let failedCount = 0;
  let sentCount = 0;

  for (const r of recipients) {
    // SMS channel
    if (r.smsStatus === 'delivered') deliveredCount++;
    else if (r.smsStatus === 'sent') sentCount++;
    else if (r.smsStatus === 'failed' || r.smsStatus === 'undelivered') failedCount++;

    // Email channel
    if (r.emailStatus === 'sent') sentCount++;
    else if (r.emailStatus === 'failed') failedCount++;
  }

  await scoped.update(
    emergencyBroadcasts,
    { deliveredCount, failedCount, sentCount },
    eq(emergencyBroadcasts.id, broadcastId),
  );
}

/**
 * Get a broadcast with full delivery report.
 */
export async function getBroadcastWithReport(
  broadcastId: number,
  communityId: number,
): Promise<BroadcastWithReport | null> {
  const scoped = createScopedClient(communityId);

  const broadcastRows = await scoped.selectFrom<EmergencyBroadcast>(
    emergencyBroadcasts, {}, eq(emergencyBroadcasts.id, broadcastId),
  );
  const broadcast = broadcastRows[0];
  if (!broadcast) return null;

  const recipients = await scoped.selectFrom<EmergencyBroadcastRecipient>(
    emergencyBroadcastRecipients, {}, eq(emergencyBroadcastRecipients.broadcastId, broadcastId),
  );

  // Load user names for display (scoped to recipient user IDs)
  const recipientUserIds = [...new Set(recipients.map((r) => r.userId))];
  const userRows = recipientUserIds.length > 0
    ? await scoped.selectFrom<User>(users, {}, inArray(users.id, recipientUserIds))
    : [];
  const usersById = new Map<string, string>();
  for (const u of userRows) {
    usersById.set(u.id, u.fullName ?? 'Unknown');
  }

  return {
    id: broadcast.id,
    communityId: broadcast.communityId,
    title: broadcast.title,
    body: broadcast.body,
    smsBody: broadcast.smsBody ?? null,
    severity: broadcast.severity,
    templateKey: broadcast.templateKey ?? null,
    targetAudience: broadcast.targetAudience,
    channels: typeof broadcast.channels === 'string'
      ? broadcast.channels.split(',')
      : Array.isArray(broadcast.channels) ? broadcast.channels : [],
    recipientCount: broadcast.recipientCount,
    sentCount: broadcast.sentCount,
    deliveredCount: broadcast.deliveredCount,
    failedCount: broadcast.failedCount,
    initiatedBy: broadcast.initiatedBy,
    initiatedAt: broadcast.initiatedAt,
    completedAt: broadcast.completedAt ?? null,
    canceledAt: broadcast.canceledAt ?? null,
    scheduledFor: broadcast.scheduledFor ?? null,
    sendClaimedAt: broadcast.sendClaimedAt ?? null,
    sendOutcome: broadcast.sendOutcome ?? null,
    sendOutcomeReason: broadcast.sendOutcomeReason ?? null,
    recipients: recipients.map((r) => ({
      userId: r.userId,
      email: r.email ?? null,
      phone: r.phone ? maskPhone(r.phone) : null,
      fullName: usersById.get(r.userId) ?? 'Unknown',
      smsStatus: r.smsStatus,
      emailStatus: r.emailStatus,
      smsSentAt: r.smsSentAt ?? null,
      smsDeliveredAt: r.smsDeliveredAt ?? null,
      emailSentAt: r.emailSentAt ?? null,
    })),
  };
}

/**
 * What a non-manager may see of a broadcast: the message they received.
 * No recipient list, delivery counts, author, audience or SMS copy — the
 * delivery report names and emails every recipient in the community.
 */
export type ResidentBroadcast = {
  id: number;
  title: string;
  body: string;
  severity: string;
  completedAt: Date;
};

/**
 * Broadcast ids actually sent to this user: they have a recipient row, and the
 * broadcast was sent (`completedAt`) and not canceled. Recipient rows are
 * written at DRAFT time, so the row alone does not mean "received".
 */
async function sentToUserWhere(communityId: number, userId: string): Promise<SQL | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<{ broadcastId: number }>(
    emergencyBroadcastRecipients,
    { broadcastId: emergencyBroadcastRecipients.broadcastId },
    eq(emergencyBroadcastRecipients.userId, userId),
  );
  const ids = [...new Set(rows.map((r) => Number(r.broadcastId)))];
  if (ids.length === 0) return null;
  return and(
    inArray(emergencyBroadcasts.id, ids),
    isNotNull(emergencyBroadcasts.completedAt),
    isNull(emergencyBroadcasts.canceledAt),
  ) as SQL;
}

function toResidentBroadcast(row: Record<string, unknown>): ResidentBroadcast {
  return {
    id: Number(row['id']),
    title: row['title'] as string,
    body: row['body'] as string,
    severity: row['severity'] as string,
    completedAt: row['completedAt'] as Date,
  };
}

/**
 * One broadcast as its recipient sees it, or null when it was not sent to them.
 *
 * AUTHZ: tenant-scoped — caller MUST have verified membership and
 * `emergency_broadcasts:read`.
 */
export async function getBroadcastForRecipient(
  broadcastId: number,
  communityId: number,
  userId: string,
): Promise<ResidentBroadcast | null> {
  const where = await sentToUserWhere(communityId, userId);
  if (!where) return null;
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<Record<string, unknown>>(
    emergencyBroadcasts,
    {},
    and(eq(emergencyBroadcasts.id, broadcastId), where),
  );
  return rows[0] ? toResidentBroadcast(rows[0]) : null;
}

/**
 * Every broadcast sent to this user, newest first (the resident list page).
 *
 * AUTHZ: same contract as getBroadcastForRecipient.
 */
export async function listBroadcastsForRecipient(
  communityId: number,
  userId: string,
): Promise<ResidentBroadcast[]> {
  const where = await sentToUserWhere(communityId, userId);
  if (!where) return [];
  const scoped = createScopedClient(communityId);
  const rows = await scoped
    .selectFrom<Record<string, unknown>>(emergencyBroadcasts, {}, where)
    .orderBy(desc(emergencyBroadcasts.completedAt));
  return rows.map(toResidentBroadcast);
}

// ── Recipient resolution ────────────────────────────────────────────────────

/**
 * Resolve emergency broadcast recipients for a community.
 *
 * Batch query across userRoles + users + notificationPreferences (no N+1).
 * For SMS: only include users with verified phone + active SMS consent.
 * For email: include all matching users (emergency bypasses digest).
 */
export async function resolveEmergencyRecipients(
  communityId: number,
  audience: BroadcastAudience,
  severity: BroadcastSeverity = 'emergency',
): Promise<ResolvedRecipient[]> {
  const scoped = createScopedClient(communityId);

  // Batch queries — no N+1
  const [roleRows, preferenceRows] = await Promise.all([
    scoped.selectFrom<UserRoleRecord>(userRoles, {}),
    scoped.selectFrom<NotificationPreference>(notificationPreferences, {}),
  ]);

  // Audience members, deduped, in role order. `users` is platform-global, so
  // only these ids are read from it — and only the columns delivery needs.
  const audienceUserIds = new Set<string>();
  for (const role of roleRows) {
    if (!role.userId || !role.role) continue;
    if (!isAudienceMatch(role.role, audience, { isUnitOwner: role.isUnitOwner === true })) continue;
    audienceUserIds.add(role.userId);
  }

  const userRows = await scoped.selectFrom<
    Pick<User, 'id' | 'email' | 'fullName' | 'phone' | 'phoneVerifiedAt'>
  >(
    users,
    {
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      phone: users.phone,
      phoneVerifiedAt: users.phoneVerifiedAt,
    },
    inArray(users.id, [...audienceUserIds]),
  );
  const usersById = new Map(userRows.map((u) => [u.id, u]));

  // Index preferences by userId
  const prefsByUserId = new Map<string, NotificationPreference>();
  for (const p of preferenceRows) {
    prefsByUserId.set(p.userId, p);
  }

  const recipients: ResolvedRecipient[] = [];

  for (const userId of audienceUserIds) {
    const user = usersById.get(userId);
    if (!user) continue;

    const email = user.email;
    const fullName = user.fullName;
    const phone = user.phone;
    const phoneVerifiedAt = user.phoneVerifiedAt;

    if (!email || !fullName) continue;

    // Normalize phone to E.164
    let normalizedPhone: string | null = null;
    let phoneVerified = false;
    if (phone && phone.length > 0) {
      normalizedPhone = normalizeToE164(phone);
      if (!isValidE164(normalizedPhone)) normalizedPhone = null;
      phoneVerified = phoneVerifiedAt != null;
    }

    // Check SMS consent (TCPA) + smsEmergencyOnly preference filter
    const prefs = prefsByUserId.get(userId);
    const hasTcpaConsent =
      prefs !== undefined &&
      prefs.smsEnabled === true &&
      prefs.smsConsentGivenAt != null &&
      prefs.smsConsentRevokedAt == null;
    // If user opted for emergency-only SMS (default), skip non-emergency broadcasts
    const smsEmergencyOnly = prefs?.smsEmergencyOnly !== false; // default true
    const smsConsented = hasTcpaConsent && (severity === 'emergency' || !smsEmergencyOnly);

    recipients.push({
      userId,
      email,
      fullName,
      phone: normalizedPhone,
      phoneVerified,
      smsConsented,
    });
  }

  return recipients;
}

// ---------------------------------------------------------------------------
// Broadcast list helpers (used by /api/v1/emergency-broadcasts GET)
// ---------------------------------------------------------------------------

export interface PaginatedEmergencyBroadcasts {
  data: Record<string, unknown>[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    pageSize: number;
  };
}

/**
 * Cursor-paginated list of emergency broadcasts in a community. Order is
 * `id desc` (equivalent to `initiatedAt desc` for monotonic bigserial).
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor's
 * community membership and `emergency_broadcasts:read` permission, and MUST
 * pass `recipientUserId` for anyone who is not a manager: then only broadcasts
 * sent to that user come back, as `ResidentBroadcast` rows.
 */
export async function paginateEmergencyBroadcasts(params: {
  communityId: number;
  cursor?: string;
  pageSize?: number;
  recipientUserId?: string;
}): Promise<PaginatedEmergencyBroadcasts> {
  const scoped = createScopedClient(params.communityId);
  if (params.recipientUserId === undefined) {
    const result = await paginate(scoped, emergencyBroadcasts, {
      cursor: params.cursor,
      pageSize: params.pageSize,
    });
    return { data: result.data, pagination: result.pagination };
  }

  const where = await sentToUserWhere(params.communityId, params.recipientUserId);
  if (!where) {
    return {
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: clampPageSize(params.pageSize) },
    };
  }
  const result = await paginate(
    scoped,
    emergencyBroadcasts,
    { cursor: params.cursor, pageSize: params.pageSize },
    { where },
  );
  return {
    data: result.data.map((row) => toResidentBroadcast(row as Record<string, unknown>)),
    pagination: result.pagination,
  };
}
