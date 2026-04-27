/**
 * Document drafts — in-progress editor state for in-app authored documents.
 *
 * Drafts never appear in the documents listing, never count toward
 * compliance, never appear in feeds. On publish, the editor's HTML renders
 * to PDF + source HTML in Supabase Storage and a normal documents row is
 * inserted with source_type='authored'. The draft is then soft-deleted.
 */
import { bigint, bigserial, boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { documentCategories } from './document-categories';
import { documents } from './documents';
import { meetings } from './meetings';
import { users } from './users';

export const documentDrafts = pgTable(
  'document_drafts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: text('title').notNull().default('Untitled'),
    /** Sanitized HTML produced by sanitizeAuthoredHtml; never raw editor input. */
    bodyHtml: text('body_html').notNull().default(''),
    targetCategoryId: bigint('target_category_id', { mode: 'number' }).references(
      () => documentCategories.id,
      { onDelete: 'set null' },
    ),
    targetMeetingId: bigint('target_meeting_id', { mode: 'number' }).references(
      () => meetings.id,
      { onDelete: 'set null' },
    ),
    /** Set when re-editing a previously-published authored document. */
    sourceDocumentId: bigint('source_document_id', { mode: 'number' }).references(
      () => documents.id,
      { onDelete: 'set null' },
    ),
    coverSheetEnabled: boolean('cover_sheet_enabled').notNull().default(false),
    /** Letterhead toggles: { header?: boolean; footer?: boolean } */
    letterheadOptions: jsonb('letterhead_options').notNull().default({}),
    lastEditorId: uuid('last_editor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    lastEditedAt: timestamp('last_edited_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_document_drafts_community').on(table.communityId),
    index('idx_document_drafts_author').on(table.authorId),
    index('idx_document_drafts_meeting').on(table.targetMeetingId),
  ],
);

export type LetterheadOptions = {
  header?: boolean;
  footer?: boolean;
};
