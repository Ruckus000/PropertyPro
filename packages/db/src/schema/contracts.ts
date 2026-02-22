/**
 * Contracts table — vendor contract tracking for condo/HOA communities (P3-52).
 *
 * Contract tracking is compliance-community-only (condo_718/hoa_720).
 * Gate via CommunityFeatures.hasCompliance, not direct type check.
 * Dates stored as UTC (AGENTS #16-17). All queries through scoped client (AGENTS #13).
 */
import { bigint, bigserial, boolean, date, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { documents } from './documents';
import { complianceChecklistItems } from './compliance-checklist-items';
import { users } from './users';
import { contractStatusEnum } from './enums';

export const contracts = pgTable('contracts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  vendorName: text('vendor_name').notNull(),
  description: text('description'),
  /** Contract monetary value (USD). */
  contractValue: numeric('contract_value', { precision: 12, scale: 2 }),
  /** Contract effective start date. */
  startDate: date('start_date', { mode: 'string' }).notNull(),
  /** Contract end/expiration date. Null means open-ended. */
  endDate: date('end_date', { mode: 'string' }),
  /** Linked uploaded document satisfying this contract record. */
  documentId: bigint('document_id', { mode: 'number' }).references(
    () => documents.id,
    { onDelete: 'restrict' },
  ),
  /** Optional link to a compliance checklist item this contract satisfies. */
  complianceChecklistItemId: bigint('compliance_checklist_item_id', { mode: 'number' }).references(
    () => complianceChecklistItems.id,
    { onDelete: 'set null' },
  ),
  /** Deadline for bid submissions. Bids are embargoed (hidden) until this date passes. */
  biddingClosesAt: timestamp('bidding_closes_at', { withTimezone: true }),
  /** Whether a conflict of interest has been declared for this contract. */
  conflictOfInterest: boolean('conflict_of_interest').notNull().default(false),
  /** Free-text note describing the nature of the conflict of interest. */
  conflictOfInterestNote: text('conflict_of_interest_note'),
  /** Current contract lifecycle status. */
  status: contractStatusEnum('status').notNull().default('active'),
  /** User who created this contract record. */
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
