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
  /** P2-38: Community logo — Supabase Storage path (stored via onboarding wizard). */
  logoPath: text('logo_path'),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  subscriptionPlan: text('subscription_plan'),
  subscriptionStatus: text('subscription_status'),
  /** P2-34a: When the most recent invoice.payment_failed event was received. Null = no active failure. */
  paymentFailedAt: timestamp('payment_failed_at', { withTimezone: true }),
  /** P2-34a: When the next payment reminder email should be sent. Null = no pending reminder. */
  nextReminderAt: timestamp('next_reminder_at', { withTimezone: true }),
  /** P2-34a: When the subscription was canceled (start of 30-day grace period). Null = not canceled. */
  subscriptionCanceledAt: timestamp('subscription_canceled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
