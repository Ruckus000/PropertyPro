/**
 * Web Push subscriptions for the platform admin console (PWA).
 *
 * One row per BROWSER, not per admin: the Push API mints a subscription per
 * service-worker registration, so an operator with the console installed on a
 * laptop and a phone legitimately has two rows. `endpoint` is therefore the
 * natural key and carries the UNIQUE constraint — re-subscribing from the same
 * browser must update the existing row rather than accumulate duplicates that
 * would each deliver the same notification.
 *
 * `p256dh` and `auth` are the subscription's PUBLIC key and auth secret from
 * the browser's own keypair. They are not our secrets and not credentials to
 * our system — they only let the push service encrypt a payload this browser
 * can open — but together with `endpoint` they are enough for anyone holding
 * them to push a notification to that device, which is why this table gets the
 * same lockdown as the rest of the platform family rather than a softer one.
 *
 * `endpoint` is CHECKed to be `https://…`. The Push API only ever issues https
 * endpoints, and web-push will happily POST to whatever string it is handed —
 * so the constraint turns "somebody wrote a bad row" into a failed INSERT
 * instead of an outbound request to an attacker-chosen host.
 *
 * `failureCount` and `lastSuccessAt` are the reaping inputs. A push endpoint
 * dies silently when the browser is uninstalled or the subscription is revoked;
 * the delivery path increments the count on a 404/410 and the row is pruned
 * once it is clearly dead, so the cron is not forever POSTing into the void.
 *
 * NOT tenant-scoped and no `community_id`: a platform admin has no community
 * membership. RLS posture is 0072's verbatim — enabled and FORCEd, ZERO
 * policies (the deny-everyone default), REVOKE ALL from anon/authenticated on
 * both the table AND its sequence, service_role retaining CRUD. The sequence
 * matters as much as the table here: leaving it open would make the table look
 * locked down while an INSERT path stayed reachable, which is the trap 0053
 * recorded.
 *
 * No FK to `users`, for the reason `platform-admin-preferences.ts` records.
 */
import { bigserial, check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const platformAdminPushSubscriptions = pgTable(
  'platform_admin_push_subscriptions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** The platform admin this browser belongs to. Several rows per admin is normal. */
    userId: uuid('user_id').notNull(),
    /**
     * The push service URL for this browser. UNIQUE — the natural key, so a
     * re-subscribe upserts instead of duplicating deliveries.
     */
    endpoint: text('endpoint').notNull().unique(),
    /** The browser's public key (base64url). Not our secret. */
    p256dh: text('p256dh').notNull(),
    /** The subscription's auth secret (base64url), used for payload encryption. */
    auth: text('auth').notNull(),
    /** Free text, for a human deciding which of their devices a row is. */
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Last delivery the push service accepted. NULL until the first one. */
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    /** Consecutive delivery failures; the input to reaping a dead endpoint. */
    failureCount: integer('failure_count').notNull().default(0),
  },
  (table) => [
    /** "Everything this admin is subscribed on", asked once per push fan-out. */
    index('platform_admin_push_subscriptions_user_idx').on(table.userId),
    /**
     * A bound on where we will send, not decoration. The Push API only issues
     * https endpoints; without this, a bad row turns into an outbound POST to
     * whatever host the string names.
     */
    check(
      'platform_admin_push_subscriptions_endpoint_https',
      sql`${table.endpoint} LIKE 'https://%'`,
    ),
  ],
);

export type PlatformAdminPushSubscription = typeof platformAdminPushSubscriptions.$inferSelect;
export type NewPlatformAdminPushSubscription =
  typeof platformAdminPushSubscriptions.$inferInsert;
