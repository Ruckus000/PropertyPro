/**
 * Site theme presets — platform-level catalog of theme token bundles.
 *
 * AUTHZ: NOT tenant-scoped. Admin-only writes from apps/admin/ under
 * platform-admin auth. Reads from apps/web/ via createUnscopedClient()
 * with a documented authorization contract.
 */
import {
  bigserial,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const siteThemePresets = pgTable('site_theme_presets', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  tokens: jsonb('tokens').notNull(),
  tier: text('tier').notNull().default('essentials'),
  isArchived: boolean('is_archived').notNull().default(false),
  isFeatured: boolean('is_featured').notNull().default(false),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SiteThemePreset = typeof siteThemePresets.$inferSelect;
export type NewSiteThemePreset = typeof siteThemePresets.$inferInsert;

/**
 * Tokens jsonb shape — kept loose at the DB layer; validated at the
 * application layer (see packages/theme/src/types.ts for the typed shape).
 */
export interface ThemePresetTokens {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
}
