import { bigint, bigserial, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

/**
 * Platform-level access plans for granting free access to communities.
 * NOT tenant-scoped — belongs in RLS_GLOBAL_TABLE_EXCLUSIONS.
 *
 * Status is computed at query time (not stored) to avoid drift:
 *   revoked_at set  → 'revoked'
 *   converted_at set → 'converted'
 *   now < expires_at → 'active'
 *   now < grace_ends_at → 'in_grace'
 *   else → 'expired'
 *
 * -- future: 'discounted' type with Stripe coupon sync
 */
export const accessPlans = pgTable('access_plans', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  graceEndsAt: timestamp('grace_ends_at', { withTimezone: true }).notNull(),
  durationMonths: integer('duration_months').notNull(),
  gracePeriodDays: integer('grace_period_days').notNull().default(30),
  stripeCouponId: text('stripe_coupon_id'),
  grantedBy: uuid('granted_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  notes: text('notes'),
  convertedAt: timestamp('converted_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: uuid('revoked_by').references(() => users.id, { onDelete: 'set null' }),
  email14dSentAt: timestamp('email_14d_sent_at', { withTimezone: true }),
  email7dSentAt: timestamp('email_7d_sent_at', { withTimezone: true }),
  emailExpiredSentAt: timestamp('email_expired_sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
