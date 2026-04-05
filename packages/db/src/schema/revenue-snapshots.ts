/**
 * revenue_snapshots — append-only daily MRR snapshots.
 *
 * Platform-wide (not tenant-scoped). Written by the revenue-snapshot cron.
 * Queries use DISTINCT ON (snapshot_date) to fetch latest per day.
 */
import {
  bigint,
  bigserial,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const revenueSnapshots = pgTable(
  'revenue_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    snapshotDate: date('snapshot_date').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    mrrCents: bigint('mrr_cents', { mode: 'number' }).notNull(),
    potentialMrrCents: bigint('potential_mrr_cents', { mode: 'number' }).notNull(),
    activeSubscriptions: integer('active_subscriptions').notNull(),
    trialingSubscriptions: integer('trialing_subscriptions').notNull(),
    pastDueSubscriptions: integer('past_due_subscriptions').notNull(),
    byPlan: jsonb('by_plan').notNull(),
    byCommunityType: jsonb('by_community_type').notNull(),
    volumeDiscountSavingsCents: bigint('volume_discount_savings_cents', { mode: 'number' })
      .notNull()
      .default(0),
    freeAccessCostCents: bigint('free_access_cost_cents', { mode: 'number' })
      .notNull()
      .default(0),
    pricesVersion: text('prices_version').notNull(),
    reconciliationDriftPct: numeric('reconciliation_drift_pct', { precision: 5, scale: 2 }),
    communitiesSkipped: integer('communities_skipped').notNull().default(0),
    mrrDeltaPct: numeric('mrr_delta_pct', { precision: 6, scale: 2 }),
  },
  (table) => [
    index('idx_revenue_snapshots_date_computed').on(table.snapshotDate, table.computedAt),
  ],
);

export type RevenueSnapshot = typeof revenueSnapshots.$inferSelect;
export type NewRevenueSnapshot = typeof revenueSnapshots.$inferInsert;
