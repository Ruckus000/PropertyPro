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
  /**
   * The specific rule or covenant a DENIAL relies on, as a field rather than
   * prose buried in `reviewNotes`.
   *
   * HB 1203 (2024) amended §720.3035 so an architectural-review denial must be
   * in writing and must state the rule relied on. Keeping the citation
   * structured is what makes it provable later — a board that writes "doesn't
   * fit the neighbourhood" into free text has not satisfied the statute, and
   * nothing about a free-text column would have caught that. Required on denial
   * at the contract layer; nullable here because approvals do not carry one and
   * because pre-existing rows have none.
   *
   * See docs/audits/2026-08-09-legal-risk-audit.md F-03.
   */
  ruleReference: text('rule_reference'),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
