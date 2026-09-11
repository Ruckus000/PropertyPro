import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  RLS_EXPECTED_TENANT_TABLE_COUNT,
  RLS_GLOBAL_EXCLUSION_NAMES,
  RLS_TENANT_TABLE_NAMES,
} from '../src/schema/rls-config';

/**
 * Static guards on migration 0073 (admin console preferences + Web Push),
 * modelled on `support-tickets-migration.test.ts` for 0072 — and not merely for
 * symmetry.
 *
 * The live-database counterpart
 * (`apps/web/__tests__/integration/platform-admin-preferences-rls.integration.test.ts`)
 * cannot cover what is asserted here, for two separate reasons:
 *
 *  1. It is `describe.skip`ped without `DATABASE_URL`, which is the case in the
 *     CI unit job — so on most PRs it proves nothing at all.
 *  2. Even with a database, it asserts the STATE of the test database, and that
 *     state has a second author. `scripts/sql/local-supabase-post-migrate.sql`
 *     re-revokes these tables after migrations run, because the Supabase stub
 *     re-opens them on every `local-test-db.sh setup`. Deleting the REVOKE lines
 *     from this migration therefore leaves that suite GREEN, while production —
 *     which has no such backstop — would be wide open. This file is the only
 *     thing that reads the migration itself.
 *
 * What is at stake: `platform_admin_preferences` maps a named operator to what
 * they watch and what they have already been told, a push subscription's
 * `endpoint`/`p256dh`/`auth` are together enough to deliver a notification to
 * that operator's device, and the anon key ships in the browser bundle.
 */

const RAW = readFileSync(
  path.resolve(__dirname, '../migrations/0073_platform_admin_preferences.sql'),
  'utf8',
);

/**
 * The SQL with `--` comments stripped.
 *
 * Every assertion runs against this, never the raw text, because the file's
 * header comment discusses the very things asserted here — it names the CHECK
 * constraints and explains why there are zero policies and why only one table
 * gets a sequence revoke. Matching prose would let a comment satisfy an
 * assertion the SQL does not, which is the definition of a vacuous test.
 */
const MIGRATION = RAW.replace(/--[^\n]*/g, '');

const TABLES = ['platform_admin_preferences', 'platform_admin_push_subscriptions'] as const;
const PUSH_SEQUENCE = 'platform_admin_push_subscriptions_id_seq';

/**
 * Just the `CREATE TABLE "platform_admin_preferences" (…);` statement.
 *
 * Some assertions are about what is ABSENT from that one table, and the file
 * contains a sibling table a few hundred characters later that legitimately has
 * the thing being ruled out. A whole-file regex would match the sibling and
 * report a pass about the wrong statement.
 */
const PREFERENCES_CREATE =
  /CREATE TABLE "platform_admin_preferences" \([\s\S]*?\n\);/.exec(MIGRATION)?.[0] ?? '';

describe('migration 0073 — platform admin preferences and push subscriptions', () => {
  it('strips comments without emptying the migration', () => {
    // Anti-vacuity: if the strip regex ever ate the statements, every assertion
    // below would pass against an empty string.
    expect(MIGRATION).toContain('CREATE TABLE "platform_admin_preferences"');
    expect(MIGRATION).toContain('CREATE TABLE "platform_admin_push_subscriptions"');
    expect(MIGRATION.length).toBeGreaterThan(1000);
  });

  describe('platform-table lockdown', () => {
    it('creates NO policies — zero policies IS the deny-everyone default', () => {
      expect(MIGRATION).not.toMatch(/CREATE POLICY/i);
    });

    // One probe per table: a single assertion over the whole file would pass
    // while one of the two tables was left wide open.
    for (const table of TABLES) {
      it(`enables and forces RLS on ${table}`, () => {
        expect(MIGRATION).toContain(
          `ALTER TABLE IF EXISTS "public"."${table}" ENABLE ROW LEVEL SECURITY;`,
        );
        expect(MIGRATION).toContain(
          `ALTER TABLE IF EXISTS "public"."${table}" FORCE ROW LEVEL SECURITY;`,
        );
      });

      it(`revokes anon/authenticated on ${table}`, () => {
        expect(MIGRATION).toContain(`REVOKE ALL ON TABLE ${table} FROM anon, authenticated;`);
      });

      it(`grants service_role CRUD on ${table}`, () => {
        expect(MIGRATION).toContain(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${table} TO service_role;`,
        );
      });
    }

    it('revokes and re-grants the push subscriptions SEQUENCE', () => {
      // Not a footnote: revoking only the table leaves the INSERT path
      // reachable while a privilege check on the table reports it locked down.
      expect(MIGRATION).toContain(
        `REVOKE ALL ON SEQUENCE ${PUSH_SEQUENCE} FROM anon, authenticated;`,
      );
      expect(MIGRATION).toContain(`GRANT USAGE, SELECT ON SEQUENCE ${PUSH_SEQUENCE} TO service_role;`);
    });

    it('touches no sequence for platform_admin_preferences, because it has none', () => {
      // The asymmetry is a DECISION — the table is keyed on user_id with no
      // bigserial — and pinning it here stops a future reader "fixing" the
      // apparent omission with a revoke on a sequence that does not exist,
      // which would fail the migration on 42P01.
      expect(MIGRATION).not.toMatch(/SEQUENCE\s+platform_admin_preferences/i);
      // …and the reason there is none: no serial column in its CREATE TABLE.
      // Sliced to that one statement rather than searched across the file,
      // because the push table's `bigserial` sits a few hundred characters
      // later and a windowed regex would match it instead — the assertion would
      // then be about the wrong table while reading as though it were not.
      expect(PREFERENCES_CREATE, 'the preferences CREATE TABLE should be present').toBeTruthy();
      expect(PREFERENCES_CREATE).not.toMatch(/serial/i);
    });
  });

  describe('column shape', () => {
    it('keys preferences on user_id itself, with no surrogate id', () => {
      expect(MIGRATION).toContain('"user_id" uuid PRIMARY KEY NOT NULL');
    });

    it('leaves the read watermark nullable', () => {
      // Never having marked anything read is a real state, and is not the same
      // as having marked everything read at the epoch — so no NOT NULL, and no
      // default.
      expect(MIGRATION).toMatch(/"notifications_read_at" timestamp with time zone(?!\s+DEFAULT)/);
      expect(MIGRATION).not.toMatch(/"notifications_read_at"[^,]*NOT NULL/);
    });

    it('defaults the two jsonb columns to an empty object and an empty array', () => {
      expect(MIGRATION).toContain(`"alert_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL`);
      expect(MIGRATION).toContain(`"push_sent_fingerprints" jsonb DEFAULT '[]'::jsonb NOT NULL`);
    });

    it('makes endpoint UNIQUE — the natural key, one row per browser', () => {
      // Without it, re-subscribing from the same browser accumulates rows that
      // each deliver the same notification.
      expect(MIGRATION).toContain(
        'CONSTRAINT "platform_admin_push_subscriptions_endpoint_unique" UNIQUE("endpoint")',
      );
    });

    it('indexes push subscriptions by user — the fan-out lookup', () => {
      expect(MIGRATION).toMatch(
        /CREATE INDEX "platform_admin_push_subscriptions_user_idx"[^;]*\("user_id"\)/,
      );
    });

    it('adds no community_id and no foreign keys', () => {
      // A platform admin holds no community membership, so there is no tenant
      // to scope by; and there is deliberately no FK to users/auth.users.
      expect(MIGRATION).not.toMatch(/community_id/);
      expect(MIGRATION).not.toMatch(/FOREIGN KEY/i);
    });
  });

  describe('CHECK constraints', () => {
    it('pins alert_prefs to a jsonb object', () => {
      // NOT NULL admits 'null'::jsonb, '[]'::jsonb and '3'::jsonb — a jsonb
      // null is a VALUE, not SQL NULL.
      expect(MIGRATION).toContain(
        `CONSTRAINT "platform_admin_preferences_alert_prefs_object" CHECK (jsonb_typeof("platform_admin_preferences"."alert_prefs") = 'object')`,
      );
    });

    it('pins push_sent_fingerprints to a jsonb array', () => {
      expect(MIGRATION).toContain(
        `CONSTRAINT "platform_admin_preferences_fingerprints_array" CHECK (jsonb_typeof("platform_admin_preferences"."push_sent_fingerprints") = 'array')`,
      );
    });

    it('bounds the push endpoint to https', () => {
      // A bound on where the delivery path will POST, not a format nicety:
      // web-push sends to whatever string it is handed.
      expect(MIGRATION).toContain(
        `CONSTRAINT "platform_admin_push_subscriptions_endpoint_https" CHECK ("platform_admin_push_subscriptions"."endpoint" LIKE 'https://%')`,
      );
    });
  });

  describe('rls-config classification', () => {
    it.each(TABLES)('%s is registered as a GLOBAL exclusion, not a tenant table', (table) => {
      expect(RLS_GLOBAL_EXCLUSION_NAMES).toContain(table);
      expect(RLS_TENANT_TABLE_NAMES).not.toContain(table);
    });

    it('does NOT bump RLS_EXPECTED_TENANT_TABLE_COUNT', () => {
      // Pinning the number here is what makes the previous assertion load
      // bearing: classifying either table as tenant-scoped would be the exact
      // opposite of the intent, and would show up as a bump to 84 or 85.
      expect(RLS_EXPECTED_TENANT_TABLE_COUNT).toBe(83);
    });
  });

  describe('the local/CI post-migrate backstop lists both tables', () => {
    // The migration's REVOKE is undone on every `local-test-db.sh setup` against
    // a PERSISTENT database — the Supabase stub re-grants blanket privileges and
    // the migrations do not re-run. A table missing from that file is therefore
    // anon-readable locally and in CI with everything green, which is precisely
    // what happened to 0068's inbox tables until 0072 exposed it.
    const POST_MIGRATE = readFileSync(
      path.resolve(__dirname, '../../../scripts/sql/local-supabase-post-migrate.sql'),
      'utf8',
    );

    it('reads a non-empty post-migrate file', () => {
      // Anti-vacuity: a wrong path would make every `toContain` below fail
      // loudly, but a truncated file would not.
      expect(POST_MIGRATE).toContain('REVOKE ALL ON TABLE');
      expect(POST_MIGRATE.length).toBeGreaterThan(1000);
    });

    it.each(TABLES)('lists %s in the table loop', (table) => {
      expect(POST_MIGRATE).toContain(`'${table}'`);
    });

    it('lists the push subscriptions sequence in the sequence loop', () => {
      expect(POST_MIGRATE).toContain(`'${PUSH_SEQUENCE}'`);
    });
  });
});
