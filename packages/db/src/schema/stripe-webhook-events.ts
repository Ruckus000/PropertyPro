import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Retention: a scheduled cleanup job should purge events older than 30 days.
export const stripeWebhookEvents = pgTable('stripe_webhook_events', {
  eventId: text('event_id').primaryKey(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => [
  index('stripe_webhook_events_received_at_idx').on(table.receivedAt),
]);
