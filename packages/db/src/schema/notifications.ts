/**
 * In-app notifications table — per-user, per-community notification feed.
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
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

export type NotificationCategory =
  | 'announcement'
  | 'document'
  | 'meeting'
  | 'maintenance'
  | 'violation'
  | 'election'
  | 'system';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export const notifications = pgTable(
  'notifications',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    actionUrl: text('action_url'),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    priority: text('priority').notNull().default('normal'),
    readAt: timestamp('read_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Main feed query: unarchived, undeleted, newest first
    index('notifications_feed_idx').on(
      table.communityId,
      table.userId,
      table.archivedAt,
      table.deletedAt,
      table.createdAt,
    ),
    // Fast unread count (partial index expressed at DB level in migration)
    index('notifications_unread_idx').on(
      table.communityId,
      table.userId,
      table.readAt,
    ),
    // Idempotency: one notification per user per source event
    uniqueIndex('notifications_dedup_unique').on(
      table.communityId,
      table.userId,
      table.sourceType,
      table.sourceId,
    ),
  ],
);
