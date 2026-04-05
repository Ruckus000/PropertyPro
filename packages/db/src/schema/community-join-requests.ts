/**
 * Community join requests — self-service community linking.
 *
 * Users discover a community via public search, then submit a join request with
 * a unit identifier and resident type (owner/tenant). Community admins review
 * and approve/deny. On approval, a `user_roles` row is created.
 *
 * Eligibility guards (enforced in service layer):
 * - No existing active role for this (user, community)
 * - No pending request for this (user, community)
 * - No denial for this (user, community) within the last 30 days
 */
import {
  bigint,
  bigserial,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';

export const communityJoinRequests = pgTable(
  'community_join_requests',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    unitIdentifier: text('unit_identifier').notNull(),
    /** 'owner' | 'tenant' — the resident type claimed by the requester. */
    residentType: text('resident_type').notNull(),
    /** 'pending' | 'approved' | 'denied' | 'withdrawn' */
    status: text('status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNotes: text('review_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Partial indexes (WHERE status = 'pending' / WHERE deleted_at IS NULL) are
    // managed in the migration SQL — Drizzle's index() does not support WHERE.
    index('idx_join_requests_community_status_base').on(
      table.communityId,
      table.status,
    ),
    index('idx_join_requests_user_base').on(table.userId),
  ],
);

export type CommunityJoinRequest = typeof communityJoinRequests.$inferSelect;
export type NewCommunityJoinRequest = typeof communityJoinRequests.$inferInsert;
