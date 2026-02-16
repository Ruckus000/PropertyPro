/**
 * Notification digest queue table.
 *
 * Stores per-user digest-ready notification payloads and processor state.
 */
import {
  bigint,
  bigserial,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';
import { emailFrequencyEnum } from './enums';

export const notificationDigestQueue = pgTable(
  'notification_digest_queue',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    frequency: emailFrequencyEnum('frequency').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    eventType: text('event_type').notNull(),
    eventTitle: text('event_title').notNull(),
    eventSummary: text('event_summary'),
    actionUrl: text('action_url'),
    status: text('status').notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
    lastAttemptedAt: timestamp('last_attempted_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('notification_digest_queue_unique_idempotency').on(
      table.communityId,
      table.userId,
      table.frequency,
      table.sourceType,
      table.sourceId,
    ),
    index('notification_digest_queue_due_scan_idx').on(
      table.status,
      table.nextAttemptAt,
      table.frequency,
      table.communityId,
      table.createdAt,
    ),
    index('notification_digest_queue_rollup_idx').on(
      table.communityId,
      table.userId,
      table.frequency,
      table.status,
      table.createdAt,
    ),
  ],
);
