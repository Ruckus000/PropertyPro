/**
 * Compliance Checklist Items — tracks per-community compliance obligations.
 *
 * Each community gets a set of checklist items generated from statutory templates
 * (§718 for condos, §720 for HOAs). Apartment communities get zero items.
 *
 * Status is computed at query time from document presence and deadlines,
 * not stored as a column — this prevents stale status values.
 */
import { sql } from 'drizzle-orm';
import { bigint, bigserial, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { documents } from './documents';

export const complianceChecklistItems = pgTable(
  'compliance_checklist_items',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    /** Template key from §718 or §720 template (e.g., "718_articles_of_incorporation") */
    templateKey: text('template_key').notNull(),
    /** Human-readable title */
    title: text('title').notNull(),
    /** Detailed description of the compliance requirement */
    description: text('description'),
    /** Category for grouping (e.g., "governing_documents", "financial_records", "meeting_records") */
    category: text('category').notNull(),
    /** Statute reference (e.g., "§718.111(12)(a)1") */
    statuteReference: text('statute_reference'),
    /**
     * Linked document ID — when a document is uploaded that satisfies this item,
     * link it here. NULL means unsatisfied.
     */
    documentId: bigint('document_id', { mode: 'number' })
      .references(() => documents.id, { onDelete: 'set null' }),
    /**
     * Date the linked document was posted/uploaded (UTC).
     * Used to calculate 30-day posting deadlines and rolling windows.
     */
    documentPostedAt: timestamp('document_posted_at', { withTimezone: true }),
    /**
     * Deadline by which the document must be posted (UTC).
     * For 30-day rule items: creation date + 30 days.
     * For rolling windows: computed from the window period.
     * NULL for items without a time constraint.
     */
    deadline: timestamp('deadline', { withTimezone: true }),
    /**
     * For rolling-window items (e.g., meeting minutes must be posted within 12 months),
     * stores the window configuration as JSON.
     */
    rollingWindow: jsonb('rolling_window'),
    /** Who last modified this item */
    lastModifiedBy: uuid('last_modified_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('compliance_checklist_community_template_key_active')
      .on(table.communityId, table.templateKey)
      .where(sql`${table.deletedAt} is null`),
  ],
);
