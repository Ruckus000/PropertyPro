/**
 * Notification preferences table — per-user, per-community settings.
 * AGENTS #39: Check notification preferences before sending non-critical email.
 */
import { bigint, bigserial, boolean, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
import { communities } from './communities';

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    // Phase 1 standard fields (P1-26): email_frequency + per-type toggles + in_app_enabled
    emailFrequency: text('email_frequency').notNull().default('immediate'),
    emailAnnouncements: boolean('email_announcements').notNull().default(true),
    emailMeetings: boolean('email_meetings').notNull().default(true),
    inAppEnabled: boolean('in_app_enabled').notNull().default(true),

    // Phase 1B: SMS consent fields (TCPA compliance)
    /** Master SMS toggle — user must explicitly opt in */
    smsEnabled: boolean('sms_enabled').notNull().default(false),
    /** If true, only receive SMS for emergency broadcasts (not general notifications) */
    smsEmergencyOnly: boolean('sms_emergency_only').notNull().default(true),
    /** TCPA: when user opted in to SMS (null = never consented) */
    smsConsentGivenAt: timestamp('sms_consent_given_at', { withTimezone: true }),
    /** TCPA: when user revoked SMS consent (null = currently consented or never consented) */
    smsConsentRevokedAt: timestamp('sms_consent_revoked_at', { withTimezone: true }),
    /** How consent was given: 'web_form' | 'sms_keyword' | 'admin_import' */
    smsConsentMethod: text('sms_consent_method'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('notification_preferences_user_community_unique').on(
      table.userId,
      table.communityId,
    ),
  ],
);
