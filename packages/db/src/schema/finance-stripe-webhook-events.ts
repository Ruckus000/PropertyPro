import { bigint, bigserial, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { communities } from './communities';

export const financeStripeWebhookEvents = pgTable(
  'finance_stripe_webhook_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    stripeEventId: text('stripe_event_id').notNull(),
    eventType: text('event_type').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('finance_stripe_webhook_events_event_id_unique').on(table.stripeEventId),
    index('finance_stripe_webhook_events_community_processed_idx').on(table.communityId, table.processedAt),
  ],
);
