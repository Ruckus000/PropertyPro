import {
  bigint,
  bigserial,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const billingGroups = pgTable(
  'billing_groups',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    name: text('name').notNull(),
    stripeCustomerId: text('stripe_customer_id').notNull().unique(),
    ownerUserId: uuid('owner_user_id').notNull(),
    volumeTier: text('volume_tier').notNull().default('none'),
    activeCommunityCount: integer('active_community_count').notNull().default(0),
    couponSyncStatus: text('coupon_sync_status').notNull().default('synced'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_billing_groups_owner').on(table.ownerUserId),
    check(
      'billing_groups_volume_tier_check',
      sql`${table.volumeTier} IN ('none', 'tier_10', 'tier_15', 'tier_20')`,
    ),
    check(
      'billing_groups_coupon_sync_status_check',
      sql`${table.couponSyncStatus} IN ('synced', 'pending', 'failed')`,
    ),
  ],
);

export type BillingGroup = typeof billingGroups.$inferSelect;
export type NewBillingGroup = typeof billingGroups.$inferInsert;
