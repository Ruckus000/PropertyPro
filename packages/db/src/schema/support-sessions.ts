import { bigint, bigserial, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { supportAccessLevelEnum } from './enums';

export const supportSessions = pgTable('support_sessions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  adminUserId: uuid('admin_user_id').notNull(),
  targetUserId: uuid('target_user_id').notNull(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(),
  ticketId: text('ticket_id'),
  accessLevel: supportAccessLevelEnum('access_level').notNull().default('read_only'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  endedReason: text('ended_reason').$type<'manual' | 'expired' | 'consent_revoked'>(),
  consentId: bigint('consent_id', { mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SupportSession = typeof supportSessions.$inferSelect;
export type NewSupportSession = typeof supportSessions.$inferInsert;
