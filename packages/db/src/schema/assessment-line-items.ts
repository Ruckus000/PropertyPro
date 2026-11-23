import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  date,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { assessments } from './assessments';
import { communities } from './communities';
import { units } from './units';

export type AssessmentLineItemStatus = 'pending' | 'paid' | 'overdue' | 'waived';

export const assessmentLineItems = pgTable('assessment_line_items', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  assessmentId: bigint('assessment_id', { mode: 'number' }).references(() => assessments.id, {
    onDelete: 'set null',
  }),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  unitId: bigint('unit_id', { mode: 'number' })
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  dueDate: date('due_date').notNull().default(sql`CURRENT_DATE`),
  status: text('status').$type<AssessmentLineItemStatus>().notNull().default('pending'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paymentIntentId: text('payment_intent_id'),
  lateFeeCents: bigint('late_fee_cents', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  // One live charge per unit per assessment due date, so two concurrent
  // generations cannot both charge a unit (the generator inserts with
  // ON CONFLICT DO NOTHING). One-off fines carry a NULL assessment_id, and
  // NULLs never collide, so they are unaffected.
  uniqueIndex('assessment_line_items_unit_period_uniq')
    .on(table.assessmentId, table.unitId, table.dueDate)
    .where(sql`${table.deletedAt} IS NULL`),
]);
