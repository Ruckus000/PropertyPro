/**
 * No-login community-email unsubscribe write.
 *
 * Runs without a session (reached from a one-click email link), so it uses the
 * unscoped client. Callers MUST verify the signed token first — the token
 * authorizes the write and confines it to the exact (communityId, userId, topic)
 * it encodes.
 *
 * Opt-out state lives in the EXISTING `notification_preferences` row — the same
 * row the settings toggles write — so there is no second subscription store to
 * drift out of sync. Mirrors `insurance-alert-unsubscribe-service.ts`.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-11.
 */
import { logAuditEvent, notificationPreferences } from '@propertypro/db';
import { and, eq } from '@propertypro/db/filters';
// AUTHZ: no-session token-authorized write; confined to the token's (communityId, userId).
import { createUnscopedClient } from '@propertypro/db/unsafe';
import type { CommunityEmailTopic } from './community-email-unsubscribe-token';

/**
 * The preference columns each topic switches off.
 *
 * `notifications` writes `emailFrequency: 'never'` because that single column is
 * what both the immediate sender and the digest read — turning off one flag
 * would leave the other still mailing, which reads to the recipient as an
 * unsubscribe that did not work.
 */
const TOPIC_UPDATES: Record<CommunityEmailTopic, Record<string, unknown>> = {
  notifications: { emailFrequency: 'never' },
  announcements: { emailAnnouncements: false },
  calendar: {
    calendarReminderMeetings: false,
    calendarReminderPersonalAssessments: false,
    calendarReminderCommunityAssessments: false,
  },
};

/** Human-readable confirmation of what was turned off. */
export const TOPIC_LABELS: Record<CommunityEmailTopic, string> = {
  notifications: 'notification emails',
  announcements: 'announcement emails',
  calendar: 'event reminder emails',
};

/**
 * How the opt-out was confirmed — recorded in the audit row.
 *
 * - `confirmation_page` — a person pressed the button on the page the email's
 *   link opens, after it said what would stop.
 * - `one_click` — a mail client's RFC 8058 POST, for a topic whose opt-out
 *   stops no statutory notice.
 */
export type CommunityEmailUnsubscribeConfirmation = 'confirmation_page' | 'one_click';

/**
 * Apply the opt-out and audit it, in one transaction so neither lands alone.
 *
 * The audit row's actor is the system (`userId: null`): the token proves only
 * that someone held this recipient's link — a forwarded email works for
 * anyone — so naming the recipient as the actor would claim more than is
 * known. The recipient is the resource. The token itself is never logged:
 * `compliance_audit_log` is append-only and every manager can read it.
 */
export async function applyCommunityEmailUnsubscribe(
  payload: {
    communityId: number;
    userId: string;
    topic: CommunityEmailTopic;
  },
  options: { confirmedVia: CommunityEmailUnsubscribeConfirmation },
): Promise<void> {
  const updates = TOPIC_UPDATES[payload.topic];

  await createUnscopedClient().transaction(async (tx) => {
    const existing = await tx
      .select({ id: notificationPreferences.id })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.communityId, payload.communityId),
          eq(notificationPreferences.userId, payload.userId),
        ),
      );

    if (existing.length > 0) {
      await tx
        .update(notificationPreferences)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(notificationPreferences.id, existing[0]!.id));
    } else {
      // Lazily create the prefs row; every other column carries a schema default.
      await tx.insert(notificationPreferences).values({
        communityId: payload.communityId,
        userId: payload.userId,
        ...updates,
      } as typeof notificationPreferences.$inferInsert);
    }

    await logAuditEvent(
      {
        userId: null,
        action: 'settings_changed',
        resourceType: 'notification_preferences',
        // Same identity the preferences route uses for its own audit rows.
        resourceId: `${payload.userId}:${payload.communityId}`,
        communityId: payload.communityId,
        newValues: updates,
        metadata: {
          source: 'email_unsubscribe',
          topic: payload.topic,
          confirmedVia: options.confirmedVia,
        },
      },
      tx,
    );
  });
}
