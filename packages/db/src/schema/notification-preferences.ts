/**
 * Notification preferences table — per-user, per-community settings.
 * AGENTS #39: Check notification preferences before sending non-critical email.
 */
import { bigint, bigserial, boolean, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
import { communities } from './communities';
import { emailFrequencyEnum } from './enums';

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
    emailAnnouncements: boolean('email_announcements').notNull().default(true),
    emailDocuments: boolean('email_documents').notNull().default(true),
    emailMeetings: boolean('email_meetings').notNull().default(true),
    emailMaintenance: boolean('email_maintenance').notNull().default(true),
    emailFrequency: emailFrequencyEnum('email_frequency').notNull().default('immediate'),
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
