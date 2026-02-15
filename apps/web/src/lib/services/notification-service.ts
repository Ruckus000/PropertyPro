/**
 * Notification dispatch service — P2-41.
 *
 * Central service that sends email notifications for key events,
 * respecting user notification preferences per AGENTS Email #3.
 *
 * Patterns:
 * - Checks notification_preferences before every non-critical send
 * - Includes List-Unsubscribe header on all non-transactional emails (AGENTS Email #4)
 * - Fire-and-forget pattern (callers use `void sendNotification(...)`)
 * - Logs email sends via logAuditEvent with action='notification_sent'
 * - Never sends to users who haven't verified their email (deletedAt !== null)
 */
import { createElement } from 'react';
import {
  communities,
  createScopedClient,
  logAuditEvent,
  notificationPreferences,
  userRoles,
  users,
} from '@propertypro/db';
import {
  ComplianceAlertEmail,
  DocumentPostedEmail,
  MeetingNoticeEmail,
  MaintenanceUpdateEmail,
  sendEmail,
} from '@propertypro/email';
import type { CommunityBranding } from '@propertypro/email';
import {
  getDefaultPreferences,
  shouldSendEmailNow,
  type NotificationKind,
  type UserNotificationPreferences,
} from '@/lib/utils/email-preferences';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecipientFilter = 'all' | 'owners_only' | 'board_only' | 'community_admins';

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
}

export interface MaintenanceUpdateEvent {
  type: 'maintenance_update';
  requestTitle: string;
  previousStatus: string;
  newStatus: string;
  notes?: string;
  requestId: string;
}

export interface ComplianceAlertEvent {
  type: 'compliance_alert';
  alertTitle: string;
  alertDescription: string;
  dueDate?: string;
  severity: 'info' | 'warning' | 'critical';
  statuteReference?: string;
}

export interface DocumentPostedEvent {
  type: 'document_posted';
  documentTitle: string;
  documentCategory?: string;
  uploadedByName: string;
  documentId: string;
}

interface Recipient {
  userId: string;
  email: string;
  fullName: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BOARD_ROLES = new Set(['board_member', 'board_president']);
const ADMIN_ROLES = new Set(['board_member', 'board_president', 'cam', 'site_manager', 'property_manager_admin']);

const EVENT_TO_KIND: Record<NotificationEvent['type'], NotificationKind> = {
  meeting_notice: 'meeting',
  maintenance_update: 'maintenance',
  compliance_alert: 'meeting', // compliance alerts always go to admins; use 'meeting' kind check as a fallback
  document_posted: 'document',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function isRoleMatch(role: string, filter: RecipientFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'owners_only') return role === 'owner';
  if (filter === 'board_only') return BOARD_ROLES.has(role);
  if (filter === 'community_admins') return ADMIN_ROLES.has(role);
  return false;
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Recipient resolution with preference checking
// ---------------------------------------------------------------------------

export async function resolveRecipients(
  communityId: number,
  filter: RecipientFilter,
  notificationKind: NotificationKind,
): Promise<Recipient[]> {
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
      // Skip users with deletedAt set (unverified or deactivated)
      if (row['deletedAt'] != null) continue;
      usersById.set(userId, row);
    }
  }

  const preferencesByUserId = new Map<string, UserNotificationPreferences>();
  for (const row of preferenceRows) {
    const userId = row['userId'];
    if (typeof userId === 'string') {
      preferencesByUserId.set(userId, {
        emailAnnouncements: (row['emailAnnouncements'] as boolean | undefined) ?? true,
        emailDocuments: (row['emailDocuments'] as boolean | undefined) ?? true,
        emailMeetings: (row['emailMeetings'] as boolean | undefined) ?? true,
        emailMaintenance: (row['emailMaintenance'] as boolean | undefined) ?? true,
      });
    }
  }

  const recipients: Recipient[] = [];
  for (const row of roleRows) {
    const userId = row['userId'];
    const role = row['role'];
    if (typeof userId !== 'string' || typeof role !== 'string') continue;
    if (!isRoleMatch(role, filter)) continue;

    // Check notification preferences (AGENTS Email #3)
    const prefs = preferencesByUserId.get(userId) ?? getDefaultPreferences();
    if (!shouldSendEmailNow(notificationKind, prefs)) continue;

    const user = usersById.get(userId);
    if (!user) continue;

    const email = user['email'];
    const fullName = user['fullName'];
    if (typeof email !== 'string' || typeof fullName !== 'string') continue;

    recipients.push({ userId, email, fullName });
  }

  return recipients;
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
): { subject: string; react: React.ReactElement } {
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
 * - Resolves recipients by role filter
 * - Checks notification preferences before sending (AGENTS Email #3)
 * - Includes List-Unsubscribe header (AGENTS Email #4)
 * - Logs audit event on completion
 *
 * @returns Number of emails sent
 */
export async function sendNotification(
  communityId: number,
  event: NotificationEvent,
  recipientFilter: RecipientFilter,
  actorUserId?: string,
): Promise<number> {
  const notificationKind = EVENT_TO_KIND[event.type];
  const recipients = await resolveRecipients(communityId, recipientFilter, notificationKind);

  if (recipients.length === 0) return 0;

  const branding = await loadBranding(communityId);
  const baseUrl = getBaseUrl();
  const unsubscribeUrl = `${baseUrl}/settings?communityId=${communityId}`;

  let sentCount = 0;

  for (const batch of chunk(recipients, 100)) {
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

  // Log audit event for the notification batch
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
        recipientCount: recipients.length,
        sentCount,
      },
    });
  }

  return sentCount;
}

/**
 * Fire-and-forget wrapper. Swallows exceptions so callers do not need
 * to await the result.
 */
export function queueNotification(
  communityId: number,
  event: NotificationEvent,
  recipientFilter: RecipientFilter,
  actorUserId?: string,
): void {
  void sendNotification(communityId, event, recipientFilter, actorUserId).catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[notification-service] queue failed', {
      communityId,
      eventType: event.type,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
