/**
 * Lease renewal offers — Leases v3 (#9, E3, E4, E9).
 *
 * A renewal is an offer first and a lease second. The offer records the terms
 * proposed (rent, term or custom end date, deposit, residents), when it was
 * sent and when it expires. Signing creates the renewal lease and links it via
 * `renewal_lease_id`; the current lease is NOT touched until the new one's
 * start date, so today's row never shows next year's rent.
 *
 * At most one open offer per lease (renewal_offers_one_open_uq).
 */
import {
  bigint,
  bigserial,
  check,
  foreignKey,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { communities } from './communities';
import { leaseZeroRentReasonEnum, renewalOfferStageEnum } from './enums';
import { leases } from './leases';
import { users } from './users';

/** A proposed resident: a user id or a resident-contact id. */
export type ProposedLeaseResident = { userId: string } | { contactId: number };

export const leaseRenewalOffers = pgTable(
  'lease_renewal_offers',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    leaseId: bigint('lease_id', { mode: 'number' })
      .notNull()
      .references(() => leases.id, { onDelete: 'cascade' }),
    stage: renewalOfferStageEnum('stage').notNull().default('offer_sent'),
    offerRent: numeric('offer_rent', { precision: 10, scale: 2 }).notNull(),
    /** Required when offerRent is 0 (renewal_offers_zero_rent_needs_reason). Carried onto the renewal lease. */
    zeroRentReason: leaseZeroRentReasonEnum('zero_rent_reason'),
    /**
     * Term in months. Null with customEndDate set = custom term (E6); both
     * null = a month-to-month renewal. Never both set.
     */
    termMonths: integer('term_months'),
    customEndDate: date('custom_end_date', { mode: 'string' }),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    depositAmount: numeric('deposit_amount', { precision: 10, scale: 2 }),
    /** Residents proposed for the renewal, so changes can be shown (E3). */
    proposedResidents: jsonb('proposed_residents').$type<ProposedLeaseResident[]>(),
    sentOn: date('sent_on', { mode: 'string' }).notNull(),
    expiresOn: date('expires_on', { mode: 'string' }).notNull(),
    respondedOn: date('responded_on', { mode: 'string' }),
    respondedVia: text('responded_via').$type<'manager' | 'portal'>(),
    renewalLeaseId: bigint('renewal_lease_id', { mode: 'number' }).references(() => leases.id, {
      onDelete: 'set null',
    }),
    idempotencyKey: text('idempotency_key'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.leaseId, table.communityId],
      foreignColumns: [leases.id, leases.communityId],
      name: 'renewal_offers_lease_same_community_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.renewalLeaseId, table.communityId],
      foreignColumns: [leases.id, leases.communityId],
      name: 'renewal_offers_renewal_lease_same_community_fk',
    }),
    index('renewal_offers_lease_idx').on(table.leaseId),
    uniqueIndex('renewal_offers_one_open_uq')
      .on(table.leaseId)
      .where(sql`stage IN ('offer_sent', 'accepted')`),
    uniqueIndex('renewal_offers_idempotency_key_uq')
      .on(table.communityId, table.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
    check('renewal_offers_expires_before_start', sql`${table.expiresOn} < ${table.startDate}`),
    check('renewal_offers_expires_after_sent', sql`${table.expiresOn} >= ${table.sentOn}`),
    check('renewal_offers_rent_not_negative', sql`${table.offerRent} >= 0`),
    check(
      'renewal_offers_zero_rent_needs_reason',
      sql`${table.offerRent} > 0 OR ${table.zeroRentReason} IS NOT NULL`,
    ),
    check(
      'renewal_offers_term_or_end',
      sql`${table.termMonths} IS NULL OR ${table.customEndDate} IS NULL`,
    ),
    check(
      'renewal_offers_term_range',
      sql`${table.termMonths} IS NULL OR ${table.termMonths} BETWEEN 1 AND 36`,
    ),
    check(
      'renewal_offers_proposed_residents_array',
      sql`${table.proposedResidents} IS NULL OR jsonb_typeof(${table.proposedResidents}) = 'array'`,
    ),
    check(
      'renewal_offers_responded_via',
      sql`${table.respondedVia} IS NULL OR ${table.respondedVia} IN ('manager', 'portal')`,
    ),
  ],
);
