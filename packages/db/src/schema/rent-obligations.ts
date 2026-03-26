import { bigint, bigserial, date, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { leases } from './leases';
import { units } from './units';

export type RentObligationStatus = 'pending' | 'paid' | 'partially_paid' | 'overdue' | 'waived';

export const rentObligations = pgTable('rent_obligations', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  leaseId: bigint('lease_id', { mode: 'number' })
    .notNull()
    .references(() => leases.id, { onDelete: 'cascade' }),
  unitId: bigint('unit_id', { mode: 'number' })
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  periodStart: date('period_start', { mode: 'string' }).notNull(),
  periodEnd: date('period_end', { mode: 'string' }).notNull(),
  dueDate: date('due_date', { mode: 'string' }).notNull(),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  status: text('status').$type<RentObligationStatus>().notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
