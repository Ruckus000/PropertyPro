/**
 * Site starter packs — platform-level catalog of block-seed bundles.
 * Applied during community creation to populate the initial site.
 *
 * AUTHZ: NOT tenant-scoped. Admin-only writes from apps/admin/.
 * Reads from apps/web/ via createUnscopedClient().
 *
 * Field names align with the migration's seeded starter pack blocks
 * (see migrations/0004_site_blocks_foundation.sql).
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const siteStarterPacks = pgTable(
  'site_starter_packs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    slug: text('slug').notNull().unique(),
    displayName: text('display_name').notNull(),
    communityType: text('community_type').notNull().$type<'condo_718' | 'hoa_720' | 'apartment'>(),
    description: text('description'),
    blocks: jsonb('blocks').notNull(),
    version: integer('version').notNull().default(1),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'site_starter_packs_community_type_check',
      sql`${table.communityType} IN ('condo_718','hoa_720','apartment')`,
    ),
  ],
);

/**
 * Starter pack blocks jsonb shape — array of (blockType, blockOrder, content) tuples.
 * The content shape is validated against the matching block schema at apply-time
 * (see packages/shared/src/site-blocks/).
 */
export interface StarterPackBlock {
  blockType: string;
  blockOrder: number;
  content: Record<string, unknown>;
}
