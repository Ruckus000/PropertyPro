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
 * Migration 0044 added 'payments' (website editor v3, Phase 9).
 * Migration 0046 (Phase 11a) added the nullable `page_id` and the per-page
 * ordering index — see `page_id` and the index comments below.
 *
 * The `check()` below must list EVERY type production's constraint carries. It
 * is not decorative: drizzle-kit diffs this literal against the TIP snapshot,
 * so a type missing from either is a type the next generated migration silently
 * DROPS from the live constraint.
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
     * NOT NULL since Phase 11c (migration 0048). It was nullable through the
     * 11a→11c window because `SET NOT NULL` is gate G3: it could only run once
     * the 11b code that always writes a `page_id` — and the 11c-0 client that
     * copes with slots repeating across pages — were both LIVE in production.
     * Both shipped, so a NULL here is no longer a state the schema admits.
     *
     * 0048 re-ran 0046's home-page INSERT before backfilling, because the read
     * path stopped healing NULLs when `listSitePages` went lock-free in 11b-3
     * (healing reaches write paths only), so a community could still arrive
     * with page-less blocks and no home row.
     *
     * The FK is COMPOSITE `(community_id, page_id)` — see the table extras
     * below. MATCH SIMPLE made it inert while this was NULL; with NOT NULL it
     * is now an unconditional guarantee.
     */
    pageId: bigint('page_id', { mode: 'number' }).notNull(),
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
    // The 3-column ordering index (community_id, block_order, is_draft) was
    // DROPPED by 0048. It existed alongside the 4-column one through the
    // 11a→11c window so 11b stayed revertible; gate G3 was the deploy wait for
    // 11b and 11c-0 both being live, and both are.
    //
    // Its removal is what makes two pages able to hold the same slot. Anything
    // that still assumes a slot names at most one block community-wide is now
    // wrong — see 0048's preamble for the consumers that were re-keyed.
    //
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
      sql`${table.blockType} IN ('hero','text','image','documents','meetings','announcements','contact','faq','gallery','amenities','payments','tombstone')`,
    ),
  ],
);
