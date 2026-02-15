/**
 * Leases table — apartment lease tracking with renewal chain support (P2-37).
 *
 * Lease tracking is apartment-only (AGENTS #34: check via CommunityFeatures).
 * Dates are stored as UTC and displayed in community timezone (AGENTS #16-17).
 * All queries through scoped client (AGENTS #13).
 */
import { bigint, bigserial, date, foreignKey, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { units } from './units';
import { users } from './users';
import { leaseStatusEnum } from './enums';

export const leases = pgTable(
  'leases',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    unitId: bigint('unit_id', { mode: 'number' })
      .notNull()
      .references(() => units.id, { onDelete: 'restrict' }),
    /** The tenant user associated with this lease via user_roles */
    residentId: uuid('resident_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Lease start date (UTC) */
    startDate: date('start_date', { mode: 'string' }).notNull(),
    /** Lease end date (UTC). Null means month-to-month (never expires). */
    endDate: date('end_date', { mode: 'string' }),
    /** Monthly rent amount. Nullable for cases where rent is not tracked. */
    rentAmount: numeric('rent_amount', { precision: 10, scale: 2 }),
    /** Current lease lifecycle status */
    status: leaseStatusEnum('status').notNull().default('active'),
    /**
     * FK to previous lease for renewal chain traversal.
     * Self-referential — constraint declared in the table builder below
     * to avoid circular type issues with inline .references().
     */
    previousLeaseId: bigint('previous_lease_id', { mode: 'number' }),
    /** Free-text notes about the lease */
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.previousLeaseId],
      foreignColumns: [table.id],
      name: 'leases_previous_lease_id_fk',
    }),
  ],
);
