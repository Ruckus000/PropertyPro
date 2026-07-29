/**
 * Site blocks table — stores blocks for community public site pages.
 * Supports draft/published workflow via is_draft + published_at.
 *
 * Block types: hero, announcements, documents, meetings, contact, text, image
 * (enforced via CHECK constraint; jsx_template retired in migration 0008).
 * Migration 0010 added the Pro+ polish blocks: faq, gallery, amenities.
 * Migration 0026 added the 'tombstone' sentinel (staged deletion — a draft
 * row marking "remove the published block at this order on publish"; see
 * TOMBSTONE_BLOCK_TYPE in @propertypro/shared).
 * Migration 0046 (Phase 11a) added the nullable `page_id` and the per-page
 * ordering index — see `page_id` and the index comments below.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { sitePages } from './site-pages';

export const siteBlocks = pgTable(
  'site_blocks',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    /**
     * The page this block belongs to (website editor v3, Phase 11 multi-page).
     *
     * NULLABLE on purpose, and it stays that way until Phase 11c: 11a's expand
     * migration backfills every existing row to its community's home page, but
     * `SET NOT NULL` is gate G3 — it can only run once the 11b code that always
     * writes a `page_id` is LIVE in production. Until then a NULL here means a
     * row written by pre-11b code, not a row without a page.
     *
     * The FK is COMPOSITE `(community_id, page_id)` — see the table extras
     * below.
     */
    pageId: bigint('page_id', { mode: 'number' }),
    blockOrder: integer('block_order').notNull(),
    blockType: text('block_type').notNull(),
    content: jsonb('content').notNull().default('{}'),
    isDraft: boolean('is_draft').notNull().default(true),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // BOTH ordering indexes exist on purpose between Phases 11a and 11c.
    //
    // The 3-column one is what pre-11b code relies on; dropping it is gate G3,
    // and G3 is a DEPLOY WAIT, not just an apply — it can only happen once the
    // 11b code is live in production. Keeping it is exactly what makes 11b
    // revertible. Do not "clean this up".
    uniqueIndex('site_blocks_community_order_draft_partial')
      .on(
        table.communityId,
        table.blockOrder,
        table.isDraft,
      )
      .where(sql`${table.deletedAt} IS NULL`),
    // The 4-column successor: with pages, ordering is per-page, so uniqueness
    // is (community, page, order, draft). Added by 0046.
    uniqueIndex('site_blocks_community_page_order_draft_partial')
      .on(
        table.communityId,
        table.pageId,
        table.blockOrder,
        table.isDraft,
      )
      .where(sql`${table.deletedAt} IS NULL`),
    // COMPOSITE FK: a block's page must belong to the block's own community.
    // A single-column page_id FK would let a block in community A point at
    // community B's page, and the cascade would then make deleting B's page
    // delete A's content. MATCH SIMPLE (Postgres' default) means the constraint
    // is inert while page_id IS NULL, which is exactly what the 11a->11c window
    // needs; 11c's SET NOT NULL turns it into an unconditional guarantee.
    foreignKey({
      name: 'site_blocks_community_page_fk',
      columns: [table.communityId, table.pageId],
      foreignColumns: [sitePages.communityId, sitePages.id],
    }).onDelete('cascade'),
    check(
      'site_blocks_block_type_check',
      sql`${table.blockType} IN ('hero','text','image','documents','meetings','announcements','contact','faq','gallery','amenities','tombstone')`,
    ),
  ],
);
