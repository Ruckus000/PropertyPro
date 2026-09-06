import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { SUPPORT_MAILBOXES, SUPPORT_THREAD_STATUSES } from '@propertypro/shared';

/**
 * Static guards on migration 0068 (the platform support inbox).
 *
 * Why these assertions read migration TEXT rather than a live database: every
 * route and service test for this feature mocks the database, and the
 * DB-backed integration suites are `describe.skip`ped without Supabase env
 * vars — which is the case in the CI unit job. So NOTHING else that runs on a
 * PR can prove the constraints below exist, and they are the load-bearing ones:
 *
 *  1. `dedupe_key` UNIQUE is the idempotency fence. Without it a provider
 *     redelivery duplicates the message instead of being a no-op, and the
 *     route's 23505 branch becomes unreachable dead code that its own unit
 *     test still passes (the test mocks the error).
 *  2. RLS enabled + forced with ZERO policies, and REVOKE from anon /
 *     authenticated. The anon key ships in the browser bundle;
 *     support_inbox_messages holds raw sender HTML and quarantined third-party
 *     message bodies. A missing REVOKE is a silent public read of every
 *     support conversation, including anything sent to privacy@.
 *  3. The kind-shape CHECK. It is what makes "an internal note can never be
 *     emailed to the customer" a property of the database rather than a
 *     promise about the code.
 */

const RAW = readFileSync(
  path.resolve(__dirname, '../migrations/0068_support_inbox.sql'),
  'utf8',
);

/**
 * The SQL with `--` comments stripped.
 *
 * Every assertion runs against this, never the raw text, because the file's
 * header comment discusses the very things asserted here — it names the UNIQUE
 * index and explains why there are zero policies. Matching prose would let a
 * comment satisfy an assertion the SQL does not, which is the definition of a
 * vacuous test.
 */
const MIGRATION = RAW.replace(/--[^\n]*/g, '');

const TABLES = ['support_inbox_threads', 'support_inbox_messages'] as const;

describe('migration 0068 — support inbox', () => {
  it('strips comments without emptying the migration', () => {
    // Anti-vacuity: if the strip regex ever ate the statements, every
    // assertion below would pass against an empty string.
    expect(MIGRATION).toContain('CREATE TABLE "support_inbox_threads"');
    expect(MIGRATION).toContain('CREATE TABLE "support_inbox_messages"');
    expect(MIGRATION.length).toBeGreaterThan(1000);
  });

  describe('idempotency fence', () => {
    it('makes dedupe_key UNIQUE', () => {
      expect(MIGRATION).toMatch(
        /CREATE UNIQUE INDEX "support_inbox_messages_dedupe_key_key" ON "support_inbox_messages"[^;]*\("dedupe_key"\)/,
      );
    });

    it('does NOT rely on a unique rfc_message_id, which is nullable', () => {
      // Postgres treats NULLs as distinct, so a UNIQUE on an optional header
      // would silently fail to dedupe exactly the messages most likely to be
      // mis-threaded already. The rfc_message_id index must be non-unique.
      expect(MIGRATION).toMatch(
        /CREATE INDEX "support_inbox_messages_rfc_message_id_idx"/,
      );
      expect(MIGRATION).not.toMatch(
        /CREATE UNIQUE INDEX[^;]*"rfc_message_id"/,
      );
    });
  });

  describe('notes cannot be addressed', () => {
    it('constrains a kind=note row to carry no sender, recipient or Message-ID', () => {
      const check = MIGRATION.match(
        /CONSTRAINT "support_inbox_messages_kind_shape_check" CHECK \(([\s\S]*?)\)\),/,
      );
      expect(check).not.toBeNull();
      const body = check![1];

      for (const denied of ['from_email', 'to_emails', 'rfc_message_id']) {
        expect(body).toMatch(
          new RegExp(`"${denied}"\\s+IS NULL`),
          `kind='note' must deny ${denied}`,
        );
      }
      // And an email must have a sender, so the two branches are not symmetric.
      expect(body).toMatch(/"from_email"\s+IS NOT NULL/);
    });
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

      it(`revokes anon/authenticated on ${table} and its sequence`, () => {
        expect(MIGRATION).toContain(
          `REVOKE ALL ON TABLE ${table} FROM anon, authenticated;`,
        );
        expect(MIGRATION).toContain(
          `REVOKE ALL ON SEQUENCE ${table}_id_seq FROM anon, authenticated;`,
        );
      });

      it(`grants service_role CRUD on ${table}`, () => {
        expect(MIGRATION).toContain(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${table} TO service_role;`,
        );
        expect(MIGRATION).toContain(
          `GRANT USAGE, SELECT ON SEQUENCE ${table}_id_seq TO service_role;`,
        );
      });
    }
  });

  describe('CHECK constraints mirror the shared vocabulary', () => {
    // SQL cannot import TypeScript, so these sets are duplicated by necessity.
    // This is the only thing that notices when they drift.
    it('lists exactly SUPPORT_MAILBOXES in the mailbox check', () => {
      const expected = SUPPORT_MAILBOXES.map((m) => `'${m}'`).join(',');
      expect(MIGRATION).toContain(`"mailbox" IN (${expected})`);
    });

    it('lists exactly SUPPORT_THREAD_STATUSES in the status check', () => {
      const expected = SUPPORT_THREAD_STATUSES.map((s) => `'${s}'`).join(',');
      expect(MIGRATION).toContain(`"status" IN (${expected})`);
    });
  });
});
