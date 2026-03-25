import { bigint, bigserial, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';

export const supportAccessLog = pgTable('support_access_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  adminUserId: uuid('admin_user_id').notNull(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  sessionId: bigint('session_id', { mode: 'number' }),
  event: text('event').notNull(),
  resourceType: text('resource_type'),
  resourceId: text('resource_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type SupportAccessLogEntry = typeof supportAccessLog.$inferSelect;
export type NewSupportAccessLogEntry = typeof supportAccessLog.$inferInsert;
