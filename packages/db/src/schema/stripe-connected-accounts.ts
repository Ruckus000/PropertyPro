import { bigint, bigserial, boolean, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { communities } from './communities';

export const stripeConnectedAccounts = pgTable(
  'stripe_connected_accounts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    stripeAccountId: text('stripe_account_id').notNull(),
    onboardingComplete: boolean('onboarding_complete').notNull().default(false),
    chargesEnabled: boolean('charges_enabled').notNull().default(false),
    payoutsEnabled: boolean('payouts_enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('stripe_connected_accounts_community_unique').on(table.communityId),
    uniqueIndex('stripe_connected_accounts_stripe_account_unique').on(table.stripeAccountId),
  ],
);
