/**
 * Calendar event reminder delivery queue + audit log.
 *
 * Stores one row per user/event/preset so the reminder processor can
 * enqueue, retry, and deduplicate reminder emails safely.
 */
import {
  bigint,
  bigserial,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  integer,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

export const calendarEventReminderLog = pgTable(
  'calendar_event_reminder_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventKind: text('event_kind').notNull(),
    eventKey: text('event_key').notNull(),
    reminderPreset: text('reminder_preset').notNull(),
    status: text('status').notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
    lastAttemptedAt: timestamp('last_attempted_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    providerMessageId: text('provider_message_id'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('calendar_event_reminder_log_unique').on(
      table.communityId,
      table.userId,
      table.eventKind,
      table.eventKey,
      table.reminderPreset,
    ),
    index('calendar_event_reminder_log_due_scan_idx').on(
      table.status,
      table.nextAttemptAt,
      table.communityId,
      table.createdAt,
    ),
    index('calendar_event_reminder_log_user_scan_idx').on(
      table.communityId,
      table.userId,
      table.status,
      table.createdAt,
    ),
  ],
);
