/**
 * conversion_events — Append-only funnel analytics.
 *
 * Tracks the demo-to-paid conversion lifecycle. Global table (not tenant-scoped)
 * because events span the demo→paid transition and funnel queries run
 * cross-community for admin dashboards.
 *
 * user_id is nullable plain uuid (not FK) — demo users get banned/deleted;
 * FK would block lifecycle ops or cascade-delete analytics.
 */
import { bigint, bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { demoInstances } from './demo-instances';
import { communities } from './communities';

export const conversionEvents = pgTable(
  'conversion_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    demoId: bigint('demo_id', { mode: 'number' }).references(() => demoInstances.id),
    communityId: bigint('community_id', { mode: 'number' }).references(() => communities.id),
    eventType: text('event_type').notNull(),
    source: text('source').notNull(),
    dedupeKey: text('dedupe_key').notNull().unique(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    userId: uuid('user_id'),
    stripeEventId: text('stripe_event_id'),
    metadata: jsonb('metadata').notNull().default({}),
  },
  (table) => [
    index('idx_ce_demo').on(table.demoId),
    index('idx_ce_community').on(table.communityId),
    index('idx_ce_type_occurred').on(table.eventType, table.occurredAt),
  ],
);
