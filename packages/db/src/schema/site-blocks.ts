/**
 * Site blocks table — stores blocks for community public site pages.
 * Supports draft/published workflow via is_draft + published_at.
 *
 * Block types: hero, announcements, documents, meetings, contact, text, image, jsx_template
 * (enforced via CHECK constraint in migration 0033, extended in 0097).
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';

export const siteBlocks = pgTable(
  'site_blocks',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    blockOrder: integer('block_order').notNull(),
    blockType: text('block_type').notNull(),
    content: jsonb('content').notNull().default('{}'),
    isDraft: boolean('is_draft').notNull().default(true),
    templateVariant: text('template_variant').notNull().default('public'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('site_blocks_community_order_draft_variant_partial')
      .on(
        table.communityId,
        table.blockOrder,
        table.isDraft,
        table.templateVariant,
      )
      .where(sql`${table.deletedAt} IS NULL`),
    check(
      'site_blocks_block_type_check',
      sql`${table.blockType} IN ('jsx_template','hero','text','image','documents','meetings','announcements','contact')`,
    ),
  ],
);
