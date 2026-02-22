/**
 * Contract Bids table — tracks vendor bids for community contracts (P3-52).
 *
 * Bid details (vendor name, amount) are embargoed (hidden from API responses)
 * until the parent contract's biddingClosesAt date has passed.
 * Embargo is enforced server-side, not just in UI rendering.
 */
import { bigint, bigserial, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { contracts } from './contracts';
import { users } from './users';

export const contractBids = pgTable('contract_bids', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  contractId: bigint('contract_id', { mode: 'number' })
    .notNull()
    .references(() => contracts.id, { onDelete: 'cascade' }),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  /** Vendor submitting this bid. */
  vendorName: text('vendor_name').notNull(),
  /** Bid monetary amount (USD). */
  bidAmount: numeric('bid_amount', { precision: 12, scale: 2 }).notNull(),
  /** Free-text notes about this bid submission. */
  notes: text('notes'),
  /** When this bid was formally submitted. */
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  /** User who recorded this bid. */
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
