/**
 * Site blocks table — stores blocks for community public site pages.
 * Supports draft/published workflow via is_draft + published_at.
 *
 * Block types: hero, announcements, documents, meetings, contact, text, image
 * (enforced via CHECK constraint in migration 0033).
 */
import {
  bigint,
  bigserial,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';

// NOTE: Partial unique index (community_id, block_order, is_draft) WHERE deleted_at IS NULL
// is managed via raw SQL in migration 0035. Drizzle cannot express partial indexes.
export const siteBlocks = pgTable('site_blocks', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  blockOrder: integer('block_order').notNull(),
  blockType: text('block_type').notNull(),
  content: jsonb('content').notNull().default('{}'),
  isDraft: boolean('is_draft').notNull().default(true),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
