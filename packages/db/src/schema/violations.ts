import { bigint, bigserial, date, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { units } from './units';
import { users } from './users';

export type ViolationStatus =
  | 'reported'
  | 'noticed'
  | 'hearing_scheduled'
  | 'fined'
  | 'resolved'
  | 'dismissed';

export type ViolationSeverity = 'minor' | 'moderate' | 'major';

export const violations = pgTable('violations', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  unitId: bigint('unit_id', { mode: 'number' })
    .notNull()
    .references(() => units.id),
  reportedByUserId: uuid('reported_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  category: text('category').notNull(),
  description: text('description').notNull(),
  status: text('status').$type<ViolationStatus>().notNull().default('reported'),
  severity: text('severity').$type<ViolationSeverity>().notNull().default('minor'),
  evidenceDocumentIds: jsonb('evidence_document_ids').$type<number[]>().notNull().default([]),
  noticeDate: date('notice_date'),
  hearingDate: timestamp('hearing_date', { withTimezone: true }),
  resolutionDate: timestamp('resolution_date', { withTimezone: true }),
  resolutionNotes: text('resolution_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
