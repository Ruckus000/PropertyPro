/**
 * Lease deposits — Leases v3: §83.49 security deposit record.
 *
 * One row per deposit amount in effect. Raising the deposit (at renewal or
 * mid-lease) inserts a new row rather than editing the old one, because a
 * change in amount or in how it is held restarts the §83.49(2) 30-day notice
 * clock and the history has to show both.
 *
 * `disposition` records what happened at the end: refunded in full, or a
 * claim sent (§83.49(3)(a): 15 days to refund, 30 days to send a claim by
 * certified mail). Statute timelines are cited from search extracts and still
 * need counsel sign-off — see docs/superpowers/specs/2026-09-29-leases-v3-decisions.md.
 */
import { bigint, bigserial, check, date, foreignKey, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { communities } from './communities';
import { depositHeldMethodEnum } from './enums';
import { leases } from './leases';
import { users } from './users';

export type LeaseDepositDisposition = 'refunded_full' | 'claim_sent' | 'carried_to_transfer';

export const leaseDeposits = pgTable(
  'lease_deposits',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    leaseId: bigint('lease_id', { mode: 'number' })
      .notNull()
      .references(() => leases.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    heldMethod: depositHeldMethodEnum('held_method'),
    /** Bank name and Florida address, as the §83.49(2) notice must state. */
    depository: text('depository'),
    receivedOn: date('received_on', { mode: 'string' }),
    /** §83.49(2) written notice — due within 30 days of receivedOn. */
    noticeSentOn: date('notice_sent_on', { mode: 'string' }),
    /** E8: the deposit on the lease this one was transferred from. */
    carriedFromDepositId: bigint('carried_from_deposit_id', { mode: 'number' }),
    disposition: text('disposition').$type<LeaseDepositDisposition>(),
    dispositionOn: date('disposition_on', { mode: 'string' }),
    /** Amount kept under a claim; null for a full refund. */
    claimedAmount: numeric('claimed_amount', { precision: 10, scale: 2 }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.leaseId, table.communityId],
      foreignColumns: [leases.id, leases.communityId],
      name: 'lease_deposits_lease_same_community_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.carriedFromDepositId],
      foreignColumns: [table.id],
      name: 'lease_deposits_carried_from_fk',
    }).onDelete('set null'),
    index('lease_deposits_lease_idx').on(table.leaseId),
    check('lease_deposits_amount_not_negative', sql`${table.amount} >= 0`),
    check(
      'lease_deposits_disposition',
      sql`${table.disposition} IS NULL OR ${table.disposition} IN ('refunded_full', 'claim_sent', 'carried_to_transfer')`,
    ),
    check(
      'lease_deposits_claim_within_amount',
      sql`${table.claimedAmount} IS NULL OR (${table.claimedAmount} >= 0 AND ${table.claimedAmount} <= ${table.amount})`,
    ),
  ],
);
