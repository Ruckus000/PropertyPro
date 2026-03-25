/**
 * Documents table — file records stored in Supabase Storage.
 * Includes full-text search columns (search_text, search_vector).
 */
import { bigint, bigserial, customType, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { documentCategories } from './document-categories';
import { documentSourceTypeEnum, extractionStatusEnum } from './enums';
import { users } from './users';

/**
 * Custom tsvector column type for PostgreSQL full-text search.
 * Drizzle does not have built-in tsvector support.
 */
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const documents = pgTable(
  'documents',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    categoryId: bigint('category_id', { mode: 'number' }).references(
      () => documentCategories.id,
      { onDelete: 'restrict' },
    ),
    title: text('title').notNull(),
    description: text('description'),
    /** Supabase Storage path */
    filePath: text('file_path').notNull(),
    fileName: text('file_name').notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
    mimeType: text('mime_type').notNull(),
    sourceType: documentSourceTypeEnum('source_type').notNull().default('library'),
    uploadedBy: uuid('uploaded_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Extracted text content for search */
    searchText: text('search_text'),
    /** PostgreSQL full-text search vector */
    searchVector: tsvector('search_vector'),
    /** PDF text extraction status */
    extractionStatus: extractionStatusEnum('extraction_status').notNull().default('not_applicable'),
    /** Error message when extraction fails */
    extractionError: text('extraction_error'),
    /** Timestamp when text extraction completed */
    extractedAt: timestamp('extracted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('idx_documents_search_vector').using('gin', table.searchVector)],
);
