/**
 * Leases table — apartment lease tracking with renewal chain support (P2-37).
 *
 * Lease tracking is apartment-only (AGENTS #34: check via CommunityFeatures).
 * Dates are stored as UTC and displayed in community timezone (AGENTS #16-17).
 * All queries through scoped client (AGENTS #13).
 *
 * Leases v3 (EXPAND stage): the residents on a lease now live in
 * `lease_residents`. `resident_id` stays, dual-written with the primary
 * resident's user id, so finance, move checklists and exports keep working
 * unchanged. It became nullable because a primary resident may be a
 * household member with no login (`unit_occupants`). Dropping it is a
 * separate CONTRACT migration once nothing reads it.
 *
 * The CHECK constraints are added NOT VALID in the migration: they bind every
 * new write immediately, while existing production rows are validated in a
 * follow-up once they have been inspected. They are still declared here so
 * drizzle-kit does not emit a DROP on the next diff.
 */
import {
  bigint,
  bigserial,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { communities } from './communities';
import { documents } from './documents';
import { units } from './units';
import { users } from './users';
import { leaseEndViaEnum, leaseStatusEnum, leaseZeroRentReasonEnum } from './enums';

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
    /**
     * The primary resident's user id. Dual-written from `lease_residents` during
     * the v3 expand window. Null only when the primary resident is a
     * contact-only person (no login). New readers should use `lease_residents`.
     */
    residentId: uuid('resident_id').references(() => users.id, { onDelete: 'restrict' }),
    /** Lease start date (UTC) */
    startDate: date('start_date', { mode: 'string' }).notNull(),
    /** Lease end date (UTC). Null means month-to-month (never expires). */
    endDate: date('end_date', { mode: 'string' }),
    /**
     * Monthly rent amount. Null means "not recorded" — the UI flags it for
     * review; it is never back-filled with a made-up value. 0 is allowed only
     * with `zeroRentReason` (CHECK leases_zero_rent_needs_reason).
     */
    rentAmount: numeric('rent_amount', { precision: 10, scale: 2 }),
    zeroRentReason: leaseZeroRentReasonEnum('zero_rent_reason'),
    zeroRentNote: text('zero_rent_note'),
    /** Current lease lifecycle status */
    status: leaseStatusEnum('status').notNull().default('active'),
    /**
     * §83.575 notice period in days (0–60) the lease requires before it ends.
     * Null = not recorded. Deliberately NOT back-filled: the right value is in
     * each signed lease, and guessing one is a legal assumption.
     */
    noticeDays: integer('notice_days'),

    // ── Ending ─────────────────────────────────────────────────────────────
    // Set when notice is given, an offer is declined, the lease ends early, or
    // a transfer is scheduled. The lease stays `active` (occupied) until
    // move_out_on passes — status never flips early.
    moveOutOn: date('move_out_on', { mode: 'string' }),
    endVia: leaseEndViaEnum('end_via'),
    endReason: text('end_reason'),
    noticeReceivedOn: date('notice_received_on', { mode: 'string' }),
    cancelledReason: text('cancelled_reason'),

    // ── Links ──────────────────────────────────────────────────────────────
    /**
     * FK to previous lease for renewal chain traversal.
     * Self-referential — constraint declared in the table builder below
     * to avoid circular type issues with inline .references().
     */
    previousLeaseId: bigint('previous_lease_id', { mode: 'number' }),
    /** E8: the lease in another unit this one was transferred from. */
    transferredFromLeaseId: bigint('transferred_from_lease_id', { mode: 'number' }),
    /** E10: the signed lease PDF. */
    signedDocumentId: bigint('signed_document_id', { mode: 'number' }).references(
      () => documents.id,
      { onDelete: 'set null' },
    ),

    /** Free-text notes about the lease */
    notes: text('notes'),
    /**
     * Optimistic concurrency. Every write sends the version it read and
     * increments it; a mismatch is a 409, so two managers cannot silently
     * overwrite each other.
     */
    version: integer('version').notNull().default(1),
    /**
     * Double-submit guard. A client-generated key per form submission; the
     * partial unique index turns a double click into a conflict, not a second
     * lease.
     */
    idempotencyKey: text('idempotency_key'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
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
    foreignKey({
      columns: [table.transferredFromLeaseId],
      foreignColumns: [table.id],
      name: 'leases_transferred_from_lease_id_fk',
    }),
    // Target of the (lease_id, community_id) composite FKs on the child tables,
    // which make a cross-community link impossible at the database level.
    uniqueIndex('leases_id_community_uq').on(table.id, table.communityId),
    index('leases_unit_dates_idx').on(table.unitId, table.startDate, table.endDate),
    uniqueIndex('leases_idempotency_key_uq')
      .on(table.communityId, table.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
    check('leases_end_after_start', sql`${table.endDate} IS NULL OR ${table.endDate} > ${table.startDate}`),
    check('leases_rent_not_negative', sql`${table.rentAmount} IS NULL OR ${table.rentAmount} >= 0`),
    check(
      'leases_zero_rent_needs_reason',
      sql`${table.rentAmount} IS NULL OR ${table.rentAmount} > 0 OR ${table.zeroRentReason} IS NOT NULL`,
    ),
    check(
      'leases_notice_days_range',
      sql`${table.noticeDays} IS NULL OR ${table.noticeDays} BETWEEN 0 AND 60`,
    ),
    check(
      'leases_move_out_after_start',
      sql`${table.moveOutOn} IS NULL OR ${table.moveOutOn} >= ${table.startDate}`,
    ),
  ],
);
