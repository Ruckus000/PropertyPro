import { bigint, bigserial, integer, pgTable, text, timestamp, uuid, unique } from 'drizzle-orm/pg-core';
import { announcements } from './announcements';
import { communities } from './communities';
import { users } from './users';

export const announcementDeliveryLog = pgTable(
  'announcement_delivery_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    announcementId: bigint('announcement_id', { mode: 'number' })
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    status: text('status').notNull().default('pending'),
    providerMessageId: text('provider_message_id'),
    errorMessage: text('error_message'),
    attemptCount: integer('attempt_count').notNull().default(0),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('announcement_delivery_log_unique').on(
      table.announcementId,
      table.userId,
    ),
  ],
);
