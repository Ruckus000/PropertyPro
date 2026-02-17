import { bigserial, bigint, integer, pgTable, text, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { communities } from './communities';

export const provisioningJobs = pgTable('provisioning_jobs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' }).references(() => communities.id),
  stripeEventId: text('stripe_event_id').unique(),
  status: text('status').notNull(),
  lastSuccessfulStatus: text('last_successful_status'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0),
}, (table) => [
  check('status_check', sql`${table.status} IN ('initiated','community_created','user_linked','checklist_generated','categories_created','preferences_set','email_sent','completed','failed')`),
  check('last_successful_status_check', sql`${table.lastSuccessfulStatus} IS NULL OR ${table.lastSuccessfulStatus} IN ('community_created','user_linked','checklist_generated','categories_created','preferences_set','email_sent','completed')`),
]);
