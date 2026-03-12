import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

export type AssessmentFrequency = 'monthly' | 'quarterly' | 'annual' | 'one_time';

export const assessments = pgTable('assessments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  frequency: text('frequency').$type<AssessmentFrequency>().notNull(),
  dueDay: integer('due_day'),
  lateFeeAmountCents: bigint('late_fee_amount_cents', { mode: 'number' }).notNull().default(0),
  lateFeeDaysGrace: integer('late_fee_days_grace').notNull().default(0),
  startDate: date('start_date').notNull().default(sql`CURRENT_DATE`),
  endDate: date('end_date'),
  isActive: boolean('is_active').notNull().default(true),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
