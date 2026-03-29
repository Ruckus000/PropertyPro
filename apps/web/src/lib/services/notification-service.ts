/**
 * Notification dispatch service.
 *
 * Sends immediate emails or enqueues digest items based on user preferences.
 */
import { createElement, type ReactElement } from 'react';
import {
  communities,
  createScopedClient,
  insertNotifications,
  logAuditEvent,
  notificationPreferences,
  userRoles,
  users,
  type InsertNotificationRow,
  type NotificationCategory,
} from '@propertypro/db';
import {
  ComplianceAlertEmail,
  DocumentPostedEmail,
  MeetingNoticeEmail,
  MaintenanceUpdateEmail,
  sendEmail,
} from '@propertypro/email';
import type { CommunityBranding } from '@propertypro/email';
// Note: ADMIN_ROLES and BOARD_ROLES from shared still use legacy role names.
// The isRoleMatch function below uses new role names + presetKey directly.
import {
  getDefaultPreferences,
  isDigestFrequency,
  isNotificationTypeEnabled,
  type NotificationKind,
  type UserNotificationPreferences,
} from '@/lib/utils/email-preferences';
import {
  enqueueDigestItems,
  type EnqueueDigestItemInput,
  type DigestSourceType,
} from '@/lib/services/notification-digest-queue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecipientFilter =
  | 'all'
  | 'owners_only'
  | 'board_only'
  | 'community_admins'
  | { type: 'specific_user'; userId: string };

export type NotificationEvent =
  | MeetingNoticeEvent
  | MaintenanceUpdateEvent
  | ComplianceAlertEvent
  | DocumentPostedEvent;

export interface MeetingNoticeEvent {
  type: 'meeting_notice';
  meetingTitle: string;
  meetingDate: string;
  meetingTime: string;
  location: string;
  meetingType: 'board' | 'owner' | 'special';
  agendaUrl?: string;
  sourceType?: 'meeting';
  sourceId?: string;
}

export interface MaintenanceUpdateEvent {
  type: 'maintenance_update';
  requestTitle: string;
  previousStatus: string;
  newStatus: string;
  notes?: string;
  requestId: string;
  sourceType?: 'maintenance';
  sourceId?: string;
}

export interface ComplianceAlertEvent {
  type: 'compliance_alert';
  alertTitle: string;
  alertDescription: string;
  dueDate?: string;
  severity: 'info' | 'warning' | 'critical';
  statuteReference?: string;
  sourceType?: 'compliance';
  sourceId?: string;
}

export interface DocumentPostedEvent {
  type: 'document_posted';
  documentTitle: string;
  documentCategory?: string;
  uploadedByName: string;
  documentId: string;
  sourceType?: 'document';
  sourceId?: string;
}

interface Recipient {
  userId: string;
  email: string;
  fullName: string;
}

interface RecipientDelivery extends Recipient {
  preferences: UserNotificationPreferences;
  mode: 'immediate' | 'digest';
}

export interface NotificationDispatchResult {
  recipientsCount: number;
  sentCount: number;
  queuedCount: number;
  failedCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_TO_KIND: Record<NotificationEvent['type'], NotificationKind> = {
  meeting_notice: 'meeting',
  maintenance_update: 'maintenance',
  compliance_alert: 'meeting',
  document_posted: 'document',
};

export interface InAppNotificationEvent {
  category: NotificationCategory;
  title: string;
  body?: string;
  actionUrl?: string;
  sourceType: string;
  sourceId: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface CreateNotificationsResult {
  created: number;
  skipped: number;
}

const CATEGORY_TO_IN_APP_PREF_KEY: Record<
  NotificationCategory,
  keyof UserNotificationPreferences | null
> = {
  announcement: 'inAppAnnouncements',
  document: 'inAppDocuments',
  meeting: 'inAppMeetings',
  maintenance: 'inAppMaintenance',
  violation: 'inAppViolations',
  election: 'inAppElections',
  system: null,
};

function isInAppEnabled(
  prefs: UserNotificationPreferences,
  category: NotificationCategory,
): boolean {
  if (!prefs.inAppEnabled) return false;
  const prefKey = CATEGORY_TO_IN_APP_PREF_KEY[category];
  if (prefKey === null) return true;
  return (prefs[prefKey] as boolean | undefined) !== false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function isRoleMatch(role: string, filter: RecipientFilter, userId: string, opts?: { isUnitOwner?: boolean; presetKey?: string }): boolean {
  if (filter === 'all') return true;
  if (filter === 'owners_only') return role === 'resident' && opts?.isUnitOwner === true;
  if (filter === 'board_only') {
    // Board roles: manager with board preset (board_member or board_president)
    if (role === 'manager') {
      return opts?.presetKey === 'board_member' || opts?.presetKey === 'board_president';
    }
    return false;
  }
  if (filter === 'community_admins') {
    // Admin roles: manager + pm_admin
    return role === 'manager' || role === 'pm_admin';
  }
  if (typeof filter === 'object' && filter.type === 'specific_user') return userId === filter.userId;
  return false;
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function resolveDigestSource(event: NotificationEvent): {
  sourceType: DigestSourceType;
  sourceId: string;
} | null {
  if (event.type === 'meeting_notice') {
    if (!event.sourceId) return null;
    return {
      sourceType: event.sourceType ?? 'meeting',
      sourceId: event.sourceId,
    };
  }

  if (event.type === 'maintenance_update') {
    return {
      sourceType: event.sourceType ?? 'maintenance',
      sourceId: event.sourceId ?? event.requestId,
    };
  }

  if (event.type === 'document_posted') {
    return {
      sourceType: event.sourceType ?? 'document',
      sourceId: event.sourceId ?? event.documentId,
    };
  }

  if (event.type === 'compliance_alert') {
    if (!event.sourceId) return null;
    return {
      sourceType: event.sourceType ?? 'compliance',
      sourceId: event.sourceId,
    };
  }

  return null;
}

function buildDigestPayload(
  event: NotificationEvent,
  communityId: number,
): {
  sourceType: DigestSourceType;
  sourceId: string;
  eventType: string;
  eventTitle: string;
  eventSummary?: string;
  actionUrl?: string;
} | null {
  const source = resolveDigestSource(event);
  if (!source) return null;

  const baseUrl = getBaseUrl();
  if (event.type === 'meeting_notice') {
    return {
      ...source,
      eventType: event.type,
      eventTitle: event.meetingTitle,
      eventSummary: `${event.meetingDate} at ${event.meetingTime} · ${event.location}`,
      actionUrl: event.agendaUrl ?? `${baseUrl}/meetings?communityId=${communityId}`,
    };
  }

  if (event.type === 'maintenance_update') {
    return {
      ...source,
      eventType: event.type,
      eventTitle: event.requestTitle,
      eventSummary: `${event.previousStatus} -> ${event.newStatus}`,
      actionUrl: `${baseUrl}/maintenance/${event.requestId}?communityId=${communityId}`,
    };
  }

  if (event.type === 'document_posted') {
    return {
      ...source,
      eventType: event.type,
      eventTitle: event.documentTitle,
      eventSummary: event.documentCategory
        ? `${event.documentCategory} · Uploaded by ${event.uploadedByName}`
        : `Uploaded by ${event.uploadedByName}`,
      actionUrl: `${baseUrl}/documents/${event.documentId}?communityId=${communityId}`,
    };
  }

  return {
    ...source,
    eventType: event.type,
    eventTitle: event.alertTitle,
    eventSummary: event.alertDescription,
    actionUrl: `${baseUrl}/compliance?communityId=${communityId}`,
  };
}

async function resolveRecipientDeliveries(
  communityId: number,
  filter: RecipientFilter,
  notificationKind: NotificationKind,
  supportsDigest: boolean,
): Promise<RecipientDelivery[]> {
  const scoped = createScopedClient(communityId);

  const [roleRows, userRows, preferenceRows] = await Promise.all([
    scoped.query(userRoles),
    scoped.query(users),
    scoped.query(notificationPreferences),
  ]);

  const usersById = new Map<string, Record<string, unknown>>();
  for (const row of userRows) {
    const userId = row['id'];
    if (typeof userId === 'string') {
      if (row['deletedAt'] != null) continue;
      usersById.set(userId, row);
    }
  }

  const preferencesByUserId = new Map<string, UserNotificationPreferences>();
  for (const row of preferenceRows) {
    const userId = row['userId'];
    if (typeof userId === 'string') {
      const rawFrequency = row['emailFrequency'];
      preferencesByUserId.set(userId, {
        emailFrequency:
          rawFrequency === 'immediate' ||
          rawFrequency === 'daily_digest' ||
          rawFrequency === 'weekly_digest' ||
          rawFrequency === 'never'
            ? rawFrequency
            : 'immediate',
        emailAnnouncements: (row['emailAnnouncements'] as boolean | undefined) ?? true,
        emailMeetings: (row['emailMeetings'] as boolean | undefined) ?? true,
        inAppEnabled: (row['inAppEnabled'] as boolean | undefined) ?? true,
        inAppAnnouncements: (row['inAppAnnouncements'] as boolean | undefined) ?? true,
        inAppDocuments: (row['inAppDocuments'] as boolean | undefined) ?? true,
        inAppMeetings: (row['inAppMeetings'] as boolean | undefined) ?? true,
        inAppMaintenance: (row['inAppMaintenance'] as boolean | undefined) ?? true,
        inAppViolations: (row['inAppViolations'] as boolean | undefined) ?? true,
        inAppElections: (row['inAppElections'] as boolean | undefined) ?? true,
      });
    }
  }

  // Short-circuit: specific_user filter bypasses the role-based loop.
  // usersById is community-scoped so the submitter is always present.
  // The role loop is skipped entirely — submitter may have no userRoles row in edge cases.
  if (typeof filter === 'object' && filter.type === 'specific_user') {
    const user = usersById.get(filter.userId);
    if (!user) return [];
    const email = user['email'];
    const fullName = user['fullName'];
    if (typeof email !== 'string' || typeof fullName !== 'string') return [];
    const prefs = preferencesByUserId.get(filter.userId) ?? getDefaultPreferences();
    if (!isNotificationTypeEnabled(notificationKind, prefs) || prefs.emailFrequency === 'never') {
      return [];
    }
    const mode = supportsDigest && isDigestFrequency(prefs.emailFrequency) ? 'digest' : 'immediate';
    return [{ userId: filter.userId, email, fullName, preferences: prefs, mode }];
  }

  const recipients: RecipientDelivery[] = [];
  for (const row of roleRows) {
    const userId = row['userId'];
    const role = row['role'];
    const isUnitOwner = row['isUnitOwner'] === true;
    const presetKey = row['presetKey'] as string | undefined;
    if (typeof userId !== 'string' || typeof role !== 'string') continue;
    if (!isRoleMatch(role, filter, userId, { isUnitOwner, presetKey })) continue;

    const prefs = preferencesByUserId.get(userId) ?? getDefaultPreferences();

    let mode: 'immediate' | 'digest' | 'skip';
    if (!isNotificationTypeEnabled(notificationKind, prefs)) {
      mode = 'skip';
    } else if (prefs.emailFrequency === 'never') {
      mode = 'skip';
    } else if (supportsDigest && isDigestFrequency(prefs.emailFrequency)) {
      mode = 'digest';
    } else {
      mode = 'immediate';
    }
    if (mode === 'skip') continue;

    const user = usersById.get(userId);
    if (!user) continue;

    const email = user['email'];
    const fullName = user['fullName'];
    if (typeof email !== 'string' || typeof fullName !== 'string') continue;

    recipients.push({ userId, email, fullName, preferences: prefs, mode });
  }

  return recipients;
}

// ---------------------------------------------------------------------------
// Public recipient resolver (immediate-only)
// ---------------------------------------------------------------------------

export async function resolveRecipients(
  communityId: number,
  filter: RecipientFilter,
  notificationKind: NotificationKind,
): Promise<Recipient[]> {
  const deliveries = await resolveRecipientDeliveries(
    communityId,
    filter,
    notificationKind,
    false,
  );

  return deliveries
    .filter((delivery) => delivery.mode === 'immediate')
    .map(({ userId, email, fullName }) => ({ userId, email, fullName }));
}

async function loadBranding(communityId: number): Promise<CommunityBranding> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(communities);
  const community = rows.find((row) => row['id'] === communityId);
  return {
    communityName:
      typeof community?.['name'] === 'string' ? (community['name'] as string) : 'PropertyPro',
  };
}

// ---------------------------------------------------------------------------
// Email rendering
// ---------------------------------------------------------------------------

function renderEmailForEvent(
  event: NotificationEvent,
  recipient: Recipient,
  branding: CommunityBranding,
  communityId: number,
): { subject: string; react: ReactElement } {
  const baseUrl = getBaseUrl();

  switch (event.type) {
    case 'meeting_notice': {
      return {
        subject: `Meeting Notice: ${event.meetingTitle} on ${event.meetingDate}`,
        react: createElement(MeetingNoticeEmail, {
          branding,
          recipientName: recipient.fullName,
          meetingTitle: event.meetingTitle,
          meetingDate: event.meetingDate,
          meetingTime: event.meetingTime,
          location: event.location,
          meetingType: event.meetingType,
          agendaUrl: event.agendaUrl,
        }),
      };
    }
    case 'maintenance_update': {
      return {
        subject: `Update on your maintenance request: ${event.requestTitle}`,
        react: createElement(MaintenanceUpdateEmail, {
          branding,
          recipientName: recipient.fullName,
          requestTitle: event.requestTitle,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          notes: event.notes,
          portalUrl: `${baseUrl}/maintenance/${event.requestId}?communityId=${communityId}`,
        }),
      };
    }
    case 'compliance_alert': {
      return {
        subject: `Action Required: ${event.alertTitle} is overdue`,
        react: createElement(ComplianceAlertEmail, {
          branding,
          recipientName: recipient.fullName,
          alertTitle: event.alertTitle,
          alertDescription: event.alertDescription,
          dueDate: event.dueDate,
          dashboardUrl: `${baseUrl}/compliance?communityId=${communityId}`,
          severity: event.severity,
        }),
      };
    }
    case 'document_posted': {
      return {
        subject: `${branding.communityName}: New document posted`,
        react: createElement(DocumentPostedEmail, {
          branding,
          recipientName: recipient.fullName,
          documentTitle: event.documentTitle,
          documentCategory: event.documentCategory,
          uploadedByName: event.uploadedByName,
          portalUrl: `${baseUrl}/documents/${event.documentId}?communityId=${communityId}`,
        }),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Main dispatch function
// ---------------------------------------------------------------------------

/**
 * Send a notification to eligible recipients in a community.
 *
 * Immediate recipients receive an email now.
 * Digest recipients receive a queued digest item when source identity is available.
 *
 * @returns Number of recipients processed (immediate sends + newly queued digest rows)
 */
async function dispatchNotification(
  communityId: number,
  event: NotificationEvent,
  recipientFilter: RecipientFilter,
  actorUserId?: string,
): Promise<NotificationDispatchResult> {
  const notificationKind = EVENT_TO_KIND[event.type];
  const digestPayload = buildDigestPayload(event, communityId);
  const deliveries = await resolveRecipientDeliveries(
    communityId,
    recipientFilter,
    notificationKind,
    digestPayload != null,
  );

  if (deliveries.length === 0) {
    return {
      recipientsCount: 0,
      sentCount: 0,
      queuedCount: 0,
      failedCount: 0,
    };
  }

  const immediateRecipients = deliveries.filter((delivery) => delivery.mode === 'immediate');
  const digestRecipients =
    digestPayload == null
      ? []
      : deliveries.filter((delivery) => delivery.mode === 'digest');

  let queuedCount = 0;
  if (digestPayload && digestRecipients.length > 0) {
    const queueItems: EnqueueDigestItemInput[] = [];
    for (const delivery of digestRecipients) {
      if (!isDigestFrequency(delivery.preferences.emailFrequency)) continue;
      queueItems.push({
        communityId,
        userId: delivery.userId,
        frequency: delivery.preferences.emailFrequency,
        sourceType: digestPayload.sourceType,
        sourceId: digestPayload.sourceId,
        eventType: digestPayload.eventType,
        eventTitle: digestPayload.eventTitle,
        eventSummary: digestPayload.eventSummary,
        actionUrl: digestPayload.actionUrl,
      });
    }

    if (queueItems.length > 0) {
      const queueResult = await enqueueDigestItems(queueItems);
      queuedCount = queueResult.enqueued;
    }
  }

  let sentCount = 0;
  let failedCount = 0;
  if (immediateRecipients.length > 0) {
    const branding = await loadBranding(communityId);
    const baseUrl = getBaseUrl();
    const unsubscribeUrl = `${baseUrl}/settings?communityId=${communityId}`;

    for (const batch of chunk(immediateRecipients, 100)) {
      await Promise.all(
        batch.map(async (recipient) => {
          try {
            const { subject, react } = renderEmailForEvent(event, recipient, branding, communityId);

            await sendEmail({
              to: recipient.email,
              subject,
              category: 'non-transactional',
              unsubscribeUrl,
              react,
            });

            sentCount += 1;
          } catch (error) {
            failedCount += 1;
            // eslint-disable-next-line no-console
            console.error('[notification-service] email send failed', {
              communityId,
              userId: recipient.userId,
              eventType: event.type,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }),
      );
    }
  }

  if (actorUserId) {
    await logAuditEvent({
      userId: actorUserId,
      action: 'notification_sent',
      resourceType: event.type,
      resourceId: `${communityId}:${event.type}`,
      communityId,
      metadata: {
        eventType: event.type,
        recipientFilter,
        recipientCount: deliveries.length,
        immediateRecipientCount: immediateRecipients.length,
        digestRecipientCount: digestRecipients.length,
        sentCount,
        queuedCount,
        failedCount,
      },
    });
  }

  return {
    recipientsCount: deliveries.length,
    sentCount,
    queuedCount,
    failedCount,
  };
}

export async function sendNotification(
  communityId: number,
  event: NotificationEvent,
  recipientFilter: RecipientFilter,
  actorUserId?: string,
): Promise<number> {
  const result = await dispatchNotification(communityId, event, recipientFilter, actorUserId);
  return result.sentCount + result.queuedCount;
}

/**
 * Queue-style wrapper retained for API call sites.
 *
 * Unlike the previous fire-and-forget behavior, this function is async so
 * route handlers can await digest enqueue durability.
 */
export async function queueNotification(
  communityId: number,
  event: NotificationEvent,
  recipientFilter: RecipientFilter,
  actorUserId?: string,
): Promise<number> {
  const result = await dispatchNotification(communityId, event, recipientFilter, actorUserId);
  return result.sentCount + result.queuedCount;
}

export async function queueNotificationDetailed(
  communityId: number,
  event: NotificationEvent,
  recipientFilter: RecipientFilter,
  actorUserId?: string,
): Promise<NotificationDispatchResult> {
  return dispatchNotification(communityId, event, recipientFilter, actorUserId);
}

/**
 * Create in-app notification rows for all eligible recipients.
 *
 * Called alongside queueNotification/email calls — operates as an independent
 * channel. Failures are logged and do not propagate to callers.
 */
export async function createNotificationsForEvent(
  communityId: number,
  event: InAppNotificationEvent,
  recipientFilter: RecipientFilter,
  actorUserId?: string,
): Promise<CreateNotificationsResult> {
  let deliveries: Awaited<ReturnType<typeof resolveRecipientDeliveries>>;
  try {
    deliveries = await resolveRecipientDeliveries(
      communityId,
      recipientFilter,
      'announcement' as NotificationKind, // kind is only used for email preference checks; we do our own in-app check below
      false,
    );
  } catch (error) {
    console.error('[notification-service] createNotificationsForEvent: recipient resolution failed', {
      communityId,
      category: event.category,
      error: error instanceof Error ? error.message : String(error),
    });
    return { created: 0, skipped: 0 };
  }

  const eligible = deliveries.filter((d) => {
    if (actorUserId && d.userId === actorUserId) return false;
    return isInAppEnabled(d.preferences, event.category);
  });

  if (eligible.length === 0) return { created: 0, skipped: deliveries.length };

  const rows: InsertNotificationRow[] = eligible.map((d) => ({
    communityId,
    userId: d.userId,
    category: event.category,
    title: event.title,
    body: event.body,
    actionUrl: event.actionUrl,
    sourceType: event.sourceType,
    sourceId: event.sourceId,
    priority: event.priority ?? 'normal',
  }));

  let created = 0;
  try {
    const result = await insertNotifications(rows);
    created = result.created;
  } catch (error) {
    console.error('[notification-service] createNotificationsForEvent: insert failed', {
      communityId,
      category: event.category,
      recipientCount: rows.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return { created: 0, skipped: eligible.length };
  }

  return { created, skipped: deliveries.length - eligible.length };
}
