/**
 * Snowbird digest subscriptions — per-user opt-out + cadence + send watermark
 * for the absentee-owner activity recap (Wave 1 differentiation).
 *
 * Design: the digest is DEFAULT-ON for owners once a community's board enables
 * it (`communities.snowbird_digest_enabled`). The ABSENCE of a row therefore
 * means "subscribed at the default weekly cadence" — no backfill of a row per
 * owner. A row exists only when a user has changed their cadence (including
 * opting out with `cadence = 'off'`) or once the cron has sent to them (to
 * carry the `last_sent_at` watermark).
 *
 * This is intentionally NOT the event-granular `notification_digest_queue`: the
 * snowbird digest is compiled at send time from activity already in the
 * platform and wants a cadence independent of the user's global
 * `email_frequency`. See
 * docs/superpowers/specs/2026-07-17-wave1-snowbird-digest-design.md.
 *
 * All queries through the scoped client (AGENTS #13); tenant-scoped by
 * `community_id`, self-service by `user_id`.
 */
import { bigint, bigserial, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { communities } from './communities';
import { users } from './users';

/** Per-user cadence. `off` is an explicit opt-out; absence of a row = weekly. */
export const SNOWBIRD_DIGEST_CADENCES = ['weekly', 'monthly', 'off'] as const;
export type SnowbirdDigestCadence = (typeof SNOWBIRD_DIGEST_CADENCES)[number];

export const snowbirdDigestSubscriptions = pgTable(
  'snowbird_digest_subscriptions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** CHECK-constrained to SNOWBIRD_DIGEST_CADENCES. */
    cadence: text('cadence').notNull().default('weekly'),
    /**
     * Watermark: the moment we last successfully sent this user a digest. The
     * next compile window is [last_sent_at, now]. Null until the first send.
     */
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // One subscription row per user per community (excluding soft-deleted).
    uniqueIndex('snowbird_digest_subscriptions_user_community_unique')
      .on(table.communityId, table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);
