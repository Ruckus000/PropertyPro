/**
 * Site layout metadata — platform-level catalog row per code-shipped layout.
 * Admins edit the metadata fields (display name, tier, featured, etc.);
 * the layout code itself lives in apps/web/src/components/public-site/layouts/
 * and ships via PR.
 *
 * AUTHZ: NOT tenant-scoped. Admin-only writes from apps/admin/ under
 * platform-admin auth. Reads from apps/web/ via createUnscopedClient()
 * with a documented authorization contract.
 *
 * Field names align with the migration's seeded layouts
 * (see migrations/0004_site_blocks_foundation.sql).
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { siteThemePresets } from './site-theme-presets';

export const siteLayoutMetadata = pgTable(
  'site_layout_metadata',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    slug: text('slug').notNull().unique(),
    displayName: text('display_name').notNull(),
    tagline: text('tagline'),
    description: text('description'),
    tier: text('tier').notNull().default('essentials').$type<'essentials' | 'professional' | 'pm'>(),
    isArchived: boolean('is_archived').notNull().default(false),
    isFeatured: boolean('is_featured').notNull().default(true),
    defaultPresetSlug: text('default_preset_slug').references(() => siteThemePresets.slug, {
      onUpdate: 'cascade',
      onDelete: 'restrict',
    }),
    version: text('version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'site_layout_metadata_tier_check',
      sql`${table.tier} IN ('essentials','professional','pm')`,
    ),
  ],
);
