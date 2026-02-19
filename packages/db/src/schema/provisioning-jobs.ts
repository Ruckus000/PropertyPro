import { bigserial, bigint, check, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { communities } from './communities';
import { pendingSignups } from './pending-signups';

export const provisioningJobs = pgTable('provisioning_jobs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  // Restrict: prevent community deletion while provisioning jobs reference it.
  communityId: bigint('community_id', { mode: 'number' }).references(() => communities.id, { onDelete: 'restrict' }),
  stripeEventId: text('stripe_event_id').unique(),
  // Restrict: prevent pending signup deletion while provisioning jobs reference it.
  signupRequestId: text('signup_request_id').references(() => pendingSignups.signupRequestId, { onDelete: 'restrict' }),
  status: text('status').notNull(),
  lastSuccessfulStatus: text('last_successful_status'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0),
}, (table) => [
  check('status_check', sql`${table.status} IN ('initiated','community_created','user_linked','checklist_generated','categories_created','preferences_set','email_sent','completed','failed')`),
  check('last_successful_status_check', sql`${table.lastSuccessfulStatus} IS NULL OR ${table.lastSuccessfulStatus} IN ('community_created','user_linked','checklist_generated','categories_created','preferences_set','email_sent','completed')`),
  uniqueIndex('provisioning_jobs_signup_request_id_unique').on(table.signupRequestId),
  index('provisioning_jobs_community_status_idx').on(table.communityId, table.status),
]);
