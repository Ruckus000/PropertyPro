import { sql } from 'drizzle-orm';
import { bigint, bigserial, date, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { leases } from './leases';
import { rentObligations } from './rent-obligations';
import { units } from './units';
import { users } from './users';

export const rentPayments = pgTable('rent_payments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  leaseId: bigint('lease_id', { mode: 'number' })
    .notNull()
    .references(() => leases.id, { onDelete: 'restrict' }),
  obligationId: bigint('obligation_id', { mode: 'number' }).references(() => rentObligations.id, {
    onDelete: 'set null',
  }),
  unitId: bigint('unit_id', { mode: 'number' })
    .notNull()
    .references(() => units.id, { onDelete: 'restrict' }),
  residentId: uuid('resident_id').references(() => users.id, { onDelete: 'set null' }),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  paymentDate: date('payment_date', { mode: 'string' }).notNull().default(sql`CURRENT_DATE`),
  paymentMethod: text('payment_method'),
  externalReference: text('external_reference'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
