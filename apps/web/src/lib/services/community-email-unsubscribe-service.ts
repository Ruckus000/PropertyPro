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
import { notificationPreferences } from '@propertypro/db';
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

export async function applyCommunityEmailUnsubscribe(payload: {
  communityId: number;
  userId: string;
  topic: CommunityEmailTopic;
}): Promise<void> {
  const db = createUnscopedClient();
  const updates = TOPIC_UPDATES[payload.topic];

  const existing = await db
    .select({ id: notificationPreferences.id })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.communityId, payload.communityId),
        eq(notificationPreferences.userId, payload.userId),
      ),
    );

  if (existing.length > 0) {
    await db
      .update(notificationPreferences)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(notificationPreferences.id, existing[0]!.id));
    return;
  }

  // Lazily create the prefs row; every other column carries a schema default.
  await db.insert(notificationPreferences).values({
    communityId: payload.communityId,
    userId: payload.userId,
    ...updates,
  } as typeof notificationPreferences.$inferInsert);
}
