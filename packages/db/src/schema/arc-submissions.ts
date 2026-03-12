import { bigint, bigserial, date, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { units } from './units';
import { users } from './users';

export type ArcSubmissionStatus = 'submitted' | 'under_review' | 'approved' | 'denied' | 'withdrawn';

export const arcSubmissions = pgTable('arc_submissions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  unitId: bigint('unit_id', { mode: 'number' })
    .notNull()
    .references(() => units.id),
  submittedByUserId: uuid('submitted_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  projectType: text('project_type').notNull(),
  estimatedStartDate: date('estimated_start_date'),
  estimatedCompletionDate: date('estimated_completion_date'),
  attachmentDocumentIds: jsonb('attachment_document_ids').$type<number[]>().notNull().default([]),
  status: text('status').$type<ArcSubmissionStatus>().notNull().default('submitted'),
  reviewNotes: text('review_notes'),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
