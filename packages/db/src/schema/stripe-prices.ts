/**
 * stripe_prices — Global billing configuration.
 *
 * Mutable singleton config table. One row per (plan_id, community_type, billing_interval).
 * Replaces STRIPE_PRICE_* env vars for price resolution.
 *
 * Not community-scoped — excluded from RLS tenant tables.
 */
import { bigint, bigserial, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const stripePrices = pgTable(
  'stripe_prices',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    planId: text('plan_id').notNull(),
    communityType: text('community_type').notNull(),
    billingInterval: text('billing_interval').notNull(),
    stripePriceId: text('stripe_price_id').notNull().unique(),
    unitAmountCents: bigint('unit_amount_cents', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('stripe_prices_plan_community_interval').on(
      table.planId,
      table.communityType,
      table.billingInterval,
    ),
  ],
);
