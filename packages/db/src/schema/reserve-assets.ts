/**
 * Reserve assets — the association's major physical-asset register (Wave 1
 * differentiation, ships DARK behind hasReserveTransparency).
 *
 * A board/admin registers each major component (roof, elevator, pool, …) with
 * an install year, an expected useful life, and — optionally — a replacement
 * cost and the amount currently reserved for it. Owners see a transparent
 * register with a "remaining useful life" countdown per asset.
 *
 * COMPLIANCE POSTURE (identical to the SIRS transparency pages): this register
 * displays FACTUAL DATA ONLY — the numbers the association entered. It is NOT a
 * reserve study and NOT an assessment of reserve adequacy. PropertyPro does not
 * provide engineering, financial, or legal advice. The remaining-useful-life
 * countdown is pure arithmetic over the entered install year + useful life; it
 * makes no claim about condition, adequacy, or funding.
 *
 * Reserve-transparency is compliance-community-only (condo_718 / hoa_720). Gate
 * via CommunityFeatures.hasReserveTransparency, not a direct type check.
 *
 * Dollars are stored as integer CENTS (no floats). Notes are free text. All
 * queries go through the scoped client (AGENTS #13).
 */
import { bigint, bigserial, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { communities } from './communities';

/**
 * Major-component categories. Modeled as CHECK-constrained text (not a pgEnum)
 * so the value set can evolve without an enum-rebuild migration — the same
 * convention as wind_mitigation_reports / insurance_policies. Mirror this list
 * in packages/db/migrations/0033_reserve_assets.sql and the route contract.
 */
export const RESERVE_ASSET_CATEGORIES = [
  'roof',
  'structure',
  'elevator',
  'pool',
  'paving',
  'mechanical',
  'exterior',
  'other',
] as const;
export type ReserveAssetCategory = (typeof RESERVE_ASSET_CATEGORIES)[number];

export const reserveAssets = pgTable(
  'reserve_assets',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    /** Human label for the asset, e.g. "Main roof" or "North elevator". */
    name: text('name').notNull(),
    /** Component category — see RESERVE_ASSET_CATEGORIES (CHECK-constrained). */
    category: text('category').notNull(),
    /** Calendar year the component was installed / last replaced. */
    yearInstalled: integer('year_installed').notNull(),
    /** Expected useful life in years, as entered by the association. */
    usefulLifeYears: integer('useful_life_years').notNull(),
    /** Estimated replacement cost, in integer cents. Optional. */
    replacementCostCents: bigint('replacement_cost_cents', { mode: 'number' }),
    /** Amount currently reserved for this component, in integer cents. Optional. */
    currentReserveCents: bigint('current_reserve_cents', { mode: 'number' }),
    /** Free-text notes visible to every member. No resident personal data. */
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('reserve_assets_community_idx').on(table.communityId)],
);
