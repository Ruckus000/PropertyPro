import { bigint, bigserial, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { ledgerEntries } from './ledger-entries';
import { users } from './users';
import { violations } from './violations';

export type ViolationFineStatus = 'pending' | 'paid' | 'waived';

export const violationFines = pgTable('violation_fines', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  violationId: bigint('violation_id', { mode: 'number' })
    .notNull()
    .references(() => violations.id, { onDelete: 'cascade' }),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  ledgerEntryId: bigint('ledger_entry_id', { mode: 'number' }).references(() => ledgerEntries.id, {
    onDelete: 'set null',
  }),
  status: text('status').$type<ViolationFineStatus>().notNull().default('pending'),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  waivedAt: timestamp('waived_at', { withTimezone: true }),
  waivedByUserId: uuid('waived_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
