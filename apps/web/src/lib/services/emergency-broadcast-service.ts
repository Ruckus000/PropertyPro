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
  communities,
  createScopedClient,
  emergencyBroadcastRecipients,
  emergencyBroadcasts,
  logAuditEvent,
  notificationPreferences,
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
import { eq, and, desc, inArray } from '@propertypro/db/filters';
import { EmergencyAlertEmail, sendEmail } from '@propertypro/email';
import type { EmergencyAlertSeverity } from '@propertypro/email';
import { normalizeToE164, isValidE164, maskPhone } from '@/lib/utils/phone';
import { chunk } from '@/lib/utils/chunk';
import { sendBulkEmergencySms } from '@/lib/services/sms/sms-service';
import { isStatusAdvancement } from '@/lib/services/sms/sms-types';
import type { SmsDeliveryStatus } from '@/lib/services/sms/sms-types';

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
  initiatedBy: string;
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

interface ResolvedRecipient {
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
const MAX_BROADCAST_RECIPIENTS = 500;

// ── Helpers ─────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function isAudienceMatch(
  role: string,
  audience: BroadcastAudience,
  opts?: { isUnitOwner?: boolean },
): boolean {
  if (audience === 'all') return true;
  if (audience === 'owners_only') return role === 'resident' && opts?.isUnitOwner === true;
  return false;
}

// ── Core service functions ──────────────────────────────────────────────────

/**
 * Create a broadcast draft and resolve recipients.
 *
 * Does NOT send anything — the broadcast stays in draft state until
 * executeBroadcast() is called. Returns the broadcast with recipient count
 * for the confirmation UI.
 *
 * Does NOT call requireActiveSubscriptionForMutation() — life-safety bypass.
 */
export async function createBroadcast(
  params: CreateBroadcastParams,
): Promise<{ broadcastId: number; recipientCount: number; smsEligibleCount: number; emailCount: number }> {
  const scoped = createScopedClient(params.communityId);

  // Resolve recipients (batch query — no N+1)
  const resolved = await resolveEmergencyRecipients(params.communityId, params.targetAudience, params.severity);

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
  });

  const broadcastId = Number(broadcastRows[0]?.['id']);
  if (!broadcastId) throw new Error('Failed to create broadcast record');

  // Create recipient rows
  const smsEnabled = params.channels.includes('sms');
  const emailEnabled = params.channels.includes('email');

  let smsEligibleCount = 0;
  let emailCount = 0;

  for (const batch of chunk(resolved, 50)) {
    await scoped.insert(
      emergencyBroadcastRecipients,
      batch.map((r) => {
        const canReceiveSms = smsEnabled && r.phoneVerified && r.smsConsented && r.phone !== null;
        const canReceiveEmail = emailEnabled && r.email !== null;

        if (canReceiveSms) smsEligibleCount++;
        if (canReceiveEmail) emailCount++;

        return {
          broadcastId,
          userId: r.userId,
          email: canReceiveEmail ? r.email : null,
          phone: canReceiveSms ? r.phone : null,
          smsStatus: canReceiveSms ? 'pending' : 'skipped',
          emailStatus: canReceiveEmail ? 'pending' : 'skipped',
        };
      }),
    );
  }

  // Audit log (phone numbers masked)
  await logAuditEvent({
    userId: params.initiatedBy,
    action: 'emergency_broadcast_created',
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
    },
  });

  return { broadcastId, recipientCount: resolved.length, smsEligibleCount, emailCount };
}

/**
 * Execute a broadcast — sends SMS + email in parallel.
 *
 * SMS and email are independent: one failing does not block the other.
 * Sets completedAt when all sends are initiated (delivery is async via webhooks).
 */
export async function executeBroadcast(
  broadcastId: number,
  communityId: number,
  userId: string,
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

  // Load recipients
  const recipients = await scoped.selectFrom<EmergencyBroadcastRecipient>(
    emergencyBroadcastRecipients, {}, eq(emergencyBroadcastRecipients.broadcastId, broadcastId),
  );
  if (recipients.length > MAX_BROADCAST_RECIPIENTS) {
    throw new Error(
      `Broadcast exceeds maximum recipient limit of ${MAX_BROADCAST_RECIPIENTS}`,
    );
  }

  // If no explicit smsBody, fall back to body but truncate to SMS limit (1600 chars multi-part)
  const rawSmsBody = broadcast.smsBody ?? broadcast.body;
  const smsBody = rawSmsBody.length > 1600 ? rawSmsBody.slice(0, 1597) + '...' : rawSmsBody;
  const emailBody = broadcast.body;
  const title = broadcast.title;
  const severity = broadcast.severity;

  // Load community name for email
  const communityRows = await scoped.selectFrom<Community>(
    communities, {}, eq(communities.id, communityId),
  );
  const communityName = communityRows[0]?.name ?? 'PropertyPro';

  const statusCallbackUrl = `${getBaseUrl()}/api/v1/webhooks/twilio`;

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
            smsSentAt: result.success ? new Date() : null,
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
      let sentCount = 0;

      for (const batch of chunk(emailRecipients, 50)) {
        await Promise.all(
          batch.map(async (recipient) => {
            try {
              const result = await sendEmail({
                to: recipient.email!,
                subject: `🚨 ${title}`,
                category: 'transactional',
                react: createElement(EmergencyAlertEmail, {
                  branding: { communityName },
                  recipientName: '',
                  alertTitle: title,
                  alertBody: emailBody,
                  severity: severity as EmergencyAlertSeverity,
                  sentAt: new Date().toISOString(),
                }),
              });

              await scoped.update(
                emergencyBroadcastRecipients,
                {
                  emailStatus: 'sent',
                  emailProviderId: result.id,
                  emailSentAt: new Date(),
                },
                and(
                  eq(emergencyBroadcastRecipients.broadcastId, broadcastId),
                  eq(emergencyBroadcastRecipients.userId, recipient.userId),
                ),
              );
              sentCount++;
            } catch {
              await scoped.update(
                emergencyBroadcastRecipients,
                { emailStatus: 'failed' },
                and(
                  eq(emergencyBroadcastRecipients.broadcastId, broadcastId),
                  eq(emergencyBroadcastRecipients.userId, recipient.userId),
                ),
              );
            }
          }),
        );
      }

      return sentCount;
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
    },
  });

  return { smsQueued, emailSent };
}

/**
 * Cancel a broadcast within the undo window (10 seconds).
 *
 * Returns true if successfully canceled, false if undo window expired.
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

  // Check undo window
  const initiatedAt = broadcast.initiatedAt;
  if (!(initiatedAt instanceof Date)) throw new Error('Invalid broadcast initiation time');

  const elapsed = Date.now() - initiatedAt.getTime();
  if (elapsed > UNDO_WINDOW_MS) {
    return false; // Undo window expired
  }

  await scoped.update(
    emergencyBroadcasts,
    { canceledAt: new Date() },
    eq(emergencyBroadcasts.id, broadcastId),
  );

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
 * List broadcasts for a community (paginated, newest first).
 */
export async function listBroadcasts(
  communityId: number,
  limit = 20,
  offset = 0,
): Promise<{ broadcasts: EmergencyBroadcast[]; total: number }> {
  const scoped = createScopedClient(communityId);
  const allRows = await scoped
    .selectFrom<EmergencyBroadcast>(emergencyBroadcasts, {})
    .orderBy(desc(emergencyBroadcasts.initiatedAt));

  return {
    broadcasts: allRows.slice(offset, offset + limit),
    total: allRows.length,
  };
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
  const [roleRows, userRows, preferenceRows] = await Promise.all([
    scoped.selectFrom<UserRoleRecord>(userRoles, {}),
    scoped.selectFrom<User>(users, {}),
    scoped.selectFrom<NotificationPreference>(notificationPreferences, {}),
  ]);

  // Index users by ID
  const usersById = new Map<string, User>();
  for (const u of userRows) {
    usersById.set(u.id, u);
  }

  // Index preferences by userId
  const prefsByUserId = new Map<string, NotificationPreference>();
  for (const p of preferenceRows) {
    prefsByUserId.set(p.userId, p);
  }

  // Resolve recipients from roles
  const seen = new Set<string>();
  const recipients: ResolvedRecipient[] = [];

  for (const role of roleRows) {
    const userId = role.userId;
    const roleName = role.role;
    const isUnitOwner = role.isUnitOwner === true;

    if (!userId || !roleName) continue;
    if (!isAudienceMatch(roleName, audience, { isUnitOwner })) continue;
    if (seen.has(userId)) continue;
    seen.add(userId);

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
