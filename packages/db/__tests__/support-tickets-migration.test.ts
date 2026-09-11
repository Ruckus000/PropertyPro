import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_EVENT_KINDS,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_TITLE_MAX_LENGTH,
  SUPPORT_TICKET_TITLE_MIN_LENGTH,
} from '@propertypro/shared';

/**
 * Static guards on migration 0072 (the platform ticket queue), modelled on
 * `support-inbox-migration.test.ts` for 0068 — and not merely for symmetry.
 *
 * The live-database counterpart
 * (`apps/web/__tests__/integration/support-tickets-rls.integration.test.ts`)
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
 * What is at stake is not abstract: `support_tickets.description` and
 * `support_ticket_events.body` are free text an operator pastes customer
 * details into while triaging, and the anon key ships in the browser bundle.
 */

const RAW = readFileSync(
  path.resolve(__dirname, '../migrations/0072_support_tickets.sql'),
  'utf8',
);

/**
 * The SQL with `--` comments stripped.
 *
 * Every assertion runs against this, never the raw text, because the file's
 * header comment discusses the very things asserted here — it names the CHECK
 * constraints and explains why there are zero policies. Matching prose would
 * let a comment satisfy an assertion the SQL does not, which is the definition
 * of a vacuous test.
 */
const MIGRATION = RAW.replace(/--[^\n]*/g, '');

const TABLES = ['support_tickets', 'support_ticket_events'] as const;

describe('migration 0072 — support tickets', () => {
  it('strips comments without emptying the migration', () => {
    // Anti-vacuity: if the strip regex ever ate the statements, every
    // assertion below would pass against an empty string.
    expect(MIGRATION).toContain('CREATE TABLE "support_tickets"');
    expect(MIGRATION).toContain('CREATE TABLE "support_ticket_events"');
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

      it(`revokes anon/authenticated on ${table} and its sequence`, () => {
        expect(MIGRATION).toContain(`REVOKE ALL ON TABLE ${table} FROM anon, authenticated;`);
        // The sequence is not a footnote: revoking only the table leaves the
        // INSERT path reachable while a privilege check on the table reports
        // it locked down.
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

  describe('deletion semantics', () => {
    it('cascades events from their ticket', () => {
      // An event has no meaning without its ticket; an orphan is unreachable.
      expect(MIGRATION).toMatch(
        /"support_ticket_events_ticket_id_support_tickets_id_fk"[^;]*ON DELETE cascade/,
      );
    });

    it('does NOT cascade a ticket from its community or its thread', () => {
      // Both are nullable CONTEXT, not scope. Deleting a community or a support
      // conversation must not erase the record of the work done about it, so
      // these two are SET NULL and the contrast with the cascade above is the
      // decision, not an inconsistency.
      expect(MIGRATION).toMatch(
        /"support_tickets_community_id_communities_id_fk"[^;]*ON DELETE set null/,
      );
      expect(MIGRATION).toMatch(
        /"support_tickets_thread_id_support_inbox_threads_id_fk"[^;]*ON DELETE set null/,
      );
      expect(MIGRATION).not.toMatch(/"support_tickets_(community_id|thread_id)[^;]*ON DELETE cascade/);
    });
  });

  describe('CHECK constraints mirror the shared vocabulary', () => {
    // SQL cannot import TypeScript, so these sets are duplicated by necessity.
    // This is the only thing that notices when they drift.
    it('lists exactly SUPPORT_TICKET_PRIORITIES in the priority check', () => {
      expect(MIGRATION).toContain(
        `"priority" IN (${SUPPORT_TICKET_PRIORITIES.map((p) => `'${p}'`).join(',')})`,
      );
    });

    it('lists exactly SUPPORT_TICKET_CATEGORIES in the category check', () => {
      expect(MIGRATION).toContain(
        `"category" IN (${SUPPORT_TICKET_CATEGORIES.map((c) => `'${c}'`).join(',')})`,
      );
    });

    it('lists exactly SUPPORT_TICKET_STATUSES in the status check', () => {
      expect(MIGRATION).toContain(
        `"status" IN (${SUPPORT_TICKET_STATUSES.map((s) => `'${s}'`).join(',')})`,
      );
    });

    it('lists exactly SUPPORT_TICKET_EVENT_KINDS in the kind check', () => {
      expect(MIGRATION).toContain(
        `"kind" IN (${SUPPORT_TICKET_EVENT_KINDS.map((k) => `'${k}'`).join(',')})`,
      );
    });

    it('bounds the title to the shared min/max', () => {
      // NOT NULL does not exclude the empty string, and an untitled queue row is
      // neither clickable nor searchable.
      expect(MIGRATION).toContain(
        `char_length("support_tickets"."title") BETWEEN ${SUPPORT_TICKET_TITLE_MIN_LENGTH} AND ${SUPPORT_TICKET_TITLE_MAX_LENGTH}`,
      );
    });
  });
});
