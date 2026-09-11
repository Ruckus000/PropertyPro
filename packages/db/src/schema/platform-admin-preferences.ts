/**
 * Per-platform-admin console preferences — one row per operator, keyed on the
 * user id itself.
 *
 * There is no surrogate `id` and no sequence: a platform admin has exactly one
 * preferences row or none, so `user_id` IS the identity of the row. That shape
 * is what makes the console's write path a plain `upsert` on the primary key
 * with no read-then-write race, and it is why — unlike every other table in
 * this wave — nothing here needs a sequence revoke.
 *
 * Three things live here, and they are together rather than in three tables
 * because they are written by the same screen and read by the same request:
 *
 *  - `notificationsReadAt` is the tray's read WATERMARK, not a per-item read
 *    flag. Console signals are derived on every request from live data (a
 *    stalled Stripe sync, an error spike) rather than stored, so there is no
 *    row to mark read; a single timestamp is the only thing that CAN be stored,
 *    and "unread" means "surfaced after this instant". Nullable: never having
 *    marked anything read is a real state, and is not the same as having marked
 *    everything read at the epoch.
 *  - `alertPrefs` is the operator's per-category opt-ins plus their error-spike
 *    threshold. jsonb rather than columns because the category set is a product
 *    decision that moves with the console's feature surface, and a migration
 *    per checkbox would be the wrong trade; the CHECK below keeps it an object
 *    so a stray array or scalar cannot make every reader defensive.
 *  - `pushSentFingerprints` is a de-duplication ledger, and it is the reason
 *    this table exists at all rather than the preferences living in
 *    `user_preferences`. A push fingerprint is a content hash of an alert that
 *    has already been delivered to this admin; without it the cron that scans
 *    for signals re-notifies the same stalled sync on every tick. A jsonb ARRAY
 *    (CHECKed as such) rather than a child table because it is read whole,
 *    written whole and pruned to a bounded window — there is no query that ever
 *    wants one fingerprint.
 *
 * NOT tenant-scoped, and no `community_id` to scope by: a platform admin has no
 * community membership, which is the whole premise of the role. RLS posture is
 * 0072's verbatim (which is 0068's, which is 0053's): enabled and FORCEd, ZERO
 * policies — the deny-everyone default — with REVOKE ALL from anon/authenticated
 * and service_role retaining CRUD. The only reader and writer is apps/admin
 * over service_role behind `requirePlatformAdmin`. The anon key ships in the
 * browser bundle, and these rows map a named operator to what they watch and
 * what they have already been told, so the REVOKE is not ceremony.
 *
 * There is deliberately no FK to `users`/`auth.users`. Cross-schema FKs to
 * `auth.users` cannot be expressed in drizzle, and a FK to `public.users` would
 * make this table's integrity depend on the identity mirror rather than on the
 * platform-admin grant that actually governs it — the same choice
 * `platform_admin_audit_log.admin_user_id` records.
 */
import { check, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const platformAdminPreferences = pgTable(
  'platform_admin_preferences',
  {
    /**
     * The platform admin. PRIMARY KEY — one row per operator, which is what
     * makes the write an upsert rather than a read-modify-write.
     */
    userId: uuid('user_id').primaryKey(),
    /**
     * Read watermark for the notification tray. NULL means nothing has ever
     * been marked read, which is distinct from "read at the epoch".
     */
    notificationsReadAt: timestamp('notifications_read_at', { withTimezone: true }),
    /**
     * Per-category alert opt-ins plus `errorSpikeThreshold`. Shape is owned by
     * `AlertPrefs` in apps/admin; the CHECK below only pins that it is an
     * object, which is the part a reader cannot defend against cheaply.
     */
    alertPrefs: jsonb('alert_prefs')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /**
     * Content hashes of alerts already pushed to this admin, so the signal cron
     * does not re-notify the same condition every tick. Read whole, written
     * whole, pruned to a bounded window.
     */
    pushSentFingerprints: jsonb('push_sent_fingerprints')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * NOT NULL admits `'null'::jsonb`, `'[]'::jsonb` and `'3'::jsonb` — jsonb
     * null is a VALUE, not SQL NULL. Without these two CHECKs every reader
     * would have to re-derive the shape, and one bad write would be permanent.
     */
    check(
      'platform_admin_preferences_alert_prefs_object',
      sql`jsonb_typeof(${table.alertPrefs}) = 'object'`,
    ),
    check(
      'platform_admin_preferences_fingerprints_array',
      sql`jsonb_typeof(${table.pushSentFingerprints}) = 'array'`,
    ),
  ],
);

export type PlatformAdminPreference = typeof platformAdminPreferences.$inferSelect;
export type NewPlatformAdminPreference = typeof platformAdminPreferences.$inferInsert;
