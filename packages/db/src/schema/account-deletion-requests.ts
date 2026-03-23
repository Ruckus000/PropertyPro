import { bigint, bigserial, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

/**
 * Tracks user and community deletion workflows.
 * NOT tenant-scoped — belongs in RLS_GLOBAL_TABLE_EXCLUSIONS.
 *
 * Status machine: cooling → soft_deleted → purged
 *                 cooling → cancelled
 *                 soft_deleted → recovered
 */
export const accountDeletionRequests = pgTable('account_deletion_requests', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  requestType: text('request_type').notNull(), // 'user' | 'community'
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  communityId: bigint('community_id', { mode: 'number' }).references(() => communities.id, {
    onDelete: 'set null',
  }),
  status: text('status').notNull(), // 'cooling' | 'soft_deleted' | 'purged' | 'cancelled' | 'recovered'
  coolingEndsAt: timestamp('cooling_ends_at', { withTimezone: true }).notNull(),
  scheduledPurgeAt: timestamp('scheduled_purge_at', { withTimezone: true }),
  purgedAt: timestamp('purged_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancelledBy: uuid('cancelled_by').references(() => users.id, { onDelete: 'set null' }),
  recoveredAt: timestamp('recovered_at', { withTimezone: true }),
  platformAdminNotifiedAt: timestamp('platform_admin_notified_at', { withTimezone: true }),
  interventionNotes: text('intervention_notes'),
  confirmationEmailSentAt: timestamp('confirmation_email_sent_at', { withTimezone: true }),
  executionEmailSentAt: timestamp('execution_email_sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
