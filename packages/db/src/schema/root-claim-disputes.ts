import { bigint, bigserial, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

/**
 * Root-claim disputes (role-v3 Phase 2b). When a property_manager claims root,
 * other admins may dispute; an open row surfaces in the platform-admin queue
 * until reassigned/resolved. Platform-admin-scoped reads (no resident access);
 * tenant write-scope trigger applies via community_id.
 */
export const rootClaimDisputes = pgTable('root_claim_disputes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  claimedUserId: uuid('claimed_user_id')
    .notNull()
    .references(() => users.id),
  disputedByUserId: uuid('disputed_by_user_id')
    .notNull()
    .references(() => users.id),
  status: text('status').notNull().default('open'), // 'open' | 'resolved'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
});
