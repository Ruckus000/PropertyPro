/**
 * Communities table — the core tenant entity.
 * Every tenant-scoped table references communities.id.
 */
import { bigserial, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { communityTypeEnum } from './enums';

export const communities = pgTable('communities', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  communityType: communityTypeEnum('community_type').notNull(),
  /** AGENTS #19: Florida spans Eastern + Central. Timezone is per-community. */
  timezone: text('timezone').notNull().default('America/New_York'),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  state: text('state'),
  zipCode: text('zip_code'),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  subscriptionPlan: text('subscription_plan'),
  subscriptionStatus: text('subscription_status'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
