import type { LedgerEntryType, LedgerMetadata, LedgerSourceType } from '@propertypro/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  date,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { units } from './units';
import { users } from './users';

export const ledgerEntries = pgTable('ledger_entries', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  entryType: text('entry_type').$type<LedgerEntryType>().notNull(),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  description: text('description').notNull(),
  sourceType: text('source_type').$type<LedgerSourceType>().notNull(),
  sourceId: text('source_id'),
  unitId: bigint('unit_id', { mode: 'number' }).references(() => units.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  effectiveDate: date('effective_date').notNull().default(sql`CURRENT_DATE`),
  metadata: jsonb('metadata').$type<LedgerMetadata>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
