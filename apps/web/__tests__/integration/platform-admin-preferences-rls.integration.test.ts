/**
 * 0073 — `platform_admin_preferences` / `platform_admin_push_subscriptions` are
 * platform-scoped and locked to the 0072 posture: RLS enabled and FORCEd, zero
 * policies, table privileges revoked from anon/authenticated and granted to
 * service_role only, plus the same on the push table's SEQUENCE.
 *
 * Pinned here, against a real server, because nothing else can pin it. Every
 * route and service test in wave 4 mocks the database, so a migration that
 * silently lost its REVOKE would leave these rows readable through the anon key
 * that ships in the browser bundle, with every unit test still green. What is
 * at stake is not abstract: `platform_admin_preferences` maps a named operator
 * to what they watch and what they have already been told, and a push
 * subscription's `endpoint` + `p256dh` + `auth` are together enough for anyone
 * holding them to deliver a notification to that operator's device.
 *
 * ## Two things this file is careful about
 *
 * **Each denial gets its own transaction.** A statement that raises inside a
 * transaction aborts it, so a second statement in the same block comes back
 * `25P02 in_failed_sql_transaction` rather than the `42501` we mean to assert —
 * a green-looking test proving the wrong thing. `deniedInOwnTransaction` below
 * exists for that, and it asserts the SQLSTATE rather than merely that it threw:
 * a bare "it rejected" also passes on `42P01 undefined_table`, so a typo in a
 * table name would sail through asserting nothing.
 *
 * **The privileged half runs over the base connection, not `SET ROLE
 * service_role`.** In production `service_role` holds `rolbypassrls`, and
 * BYPASSRLS is what outranks FORCE — that is the whole mechanism by which the
 * admin console can read a table with zero policies. The local/CI Supabase stub
 * (`scripts/sql/local-supabase-stub.sql`) creates `service_role` as a plain
 * `NOLOGIN` role with no such attribute, so `SET ROLE service_role` here would
 * be denied by RLS for a reason that has nothing to do with this migration. The
 * suite's own connection is `postgres`, which bypasses RLS exactly as prod's
 * service_role does; the GRANT that makes service_role privileged in prod is
 * asserted directly out of the catalogue instead.
 *
 * ## What this file CANNOT see
 *
 * `scripts/sql/local-supabase-post-migrate.sql` re-revokes both tables after
 * migrations run, because the Supabase stub re-opens them on every
 * `local-test-db.sh setup`. Deleting the REVOKE lines from the migration itself
 * therefore leaves this suite GREEN while production — which has no such
 * backstop — would be wide open. `packages/db/__tests__/platform-admin-preferences-migration.test.ts`
 * is the half that reads the migration text, and the two are complementary by
 * construction, not redundant.
 */
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

import { getDescribeDb, requireDatabaseUrlInCI } from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('platform_admin_preferences RLS integration tests');

const describeDb = getDescribeDb();

/** Thrown to make `sql.begin` roll back a transaction whose writes we do not want to keep. */
const ROLLBACK_SENTINEL = Symbol('platform-admin-preferences-rollback');

/**
 * Narrow a transaction handle back to the callable `Sql` interface.
 *
 * postgres.js declares `TransactionSql` as `Omit<Sql<T>, 'begin' | 'end' | …>`,
 * and TypeScript's `Omit` silently drops CALL SIGNATURES along with the named
 * keys — so `` tx`select 1` ``, the library's own documented usage, does not
 * type-check even though it works. The cast is isolated here with a name rather
 * than sprinkled at each call site.
 */
const tagged = (tx: postgres.TransactionSql): postgres.Sql => tx as unknown as postgres.Sql;

const TABLES = ['platform_admin_preferences', 'platform_admin_push_subscriptions'] as const;

describeDb('platform admin preferences + push subscriptions lockdown (0073)', () => {
  const db = postgres(process.env.DATABASE_URL!, { max: 1 });
  afterAll(() => db.end());

  /**
   * Run one statement as `role` in a transaction of its own and assert it was
   * refused with `sqlstate`.
   *
   * The transaction exists only because `SET LOCAL ROLE` needs one; it is never
   * reused, precisely so the aborted state a raised statement leaves behind
   * cannot contaminate the next assertion.
   */
  const deniedInOwnTransaction = async (
    role: string,
    what: string,
    run: (tx: postgres.Sql) => Promise<unknown>,
    sqlstate = '42501',
  ) => {
    let error: unknown;
    try {
      await db.begin(async (tx) => {
        await tx.unsafe(`set local role ${role}`);
        await run(tagged(tx));
      });
    } catch (err) {
      // Caught OUTSIDE `begin`: postgres.js rolls the transaction back and
      // re-raises the original PostgresError from the `begin` promise, so an
      // inner try/catch would leave `error` set AND let the outer promise
      // reject unhandled.
      error = err;
    }
    expect(error, `${role} should have been refused ${what}`).toBeDefined();
    expect(
      (error as { code?: string }).code,
      `${role} ${what} should fail with ${sqlstate}, not ${(error as { code?: string }).code}`,
    ).toBe(sqlstate);
  };

  describe('anon and authenticated are denied', () => {
    for (const role of ['anon', 'authenticated'] as const) {
      it(`${role} cannot read or write platform_admin_preferences`, async () => {
        await deniedInOwnTransaction(
          role,
          'SELECT on platform_admin_preferences',
          (tx) => tx`select user_id from platform_admin_preferences limit 1`,
        );
        await deniedInOwnTransaction(role, 'INSERT on platform_admin_preferences', (tx) =>
          tx`insert into platform_admin_preferences (user_id) values (${randomUUID()}::uuid)`,
        );
      });

      it(`${role} cannot read or write platform_admin_push_subscriptions`, async () => {
        await deniedInOwnTransaction(
          role,
          'SELECT on platform_admin_push_subscriptions',
          (tx) => tx`select id from platform_admin_push_subscriptions limit 1`,
        );
        await deniedInOwnTransaction(role, 'INSERT on platform_admin_push_subscriptions', (tx) =>
          tx`insert into platform_admin_push_subscriptions (user_id, endpoint, p256dh, auth)
             values (${randomUUID()}::uuid, 'https://push.example/abc', 'k', 'a')`,
        );
      });
    }
  });

  describe('table posture', () => {
    it.each(TABLES)('%s has RLS enabled AND forced, with zero policies', async (tableName) => {
      const [row] = await db<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
        select c.relrowsecurity, c.relforcerowsecurity
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = ${tableName}
      `;
      // Anti-vacuity: an absent table would leave `row` undefined and every
      // toBe() below comparing undefined — a failure, not a pass — but say so
      // explicitly rather than relying on that.
      expect(row, `${tableName} should exist`).toBeDefined();
      expect(row?.relrowsecurity, `${tableName} should have RLS enabled`).toBe(true);
      expect(row?.relforcerowsecurity, `${tableName} should have RLS forced`).toBe(true);

      const policies = await db<{ policyname: string }[]>`
        select policyname from pg_policies
         where schemaname = 'public' and tablename = ${tableName}
      `;
      // Zero is the deny-everyone default and the entire access model here. A
      // policy appearing would mean somebody decided a non-privileged role
      // should read another operator's preferences, which is a product
      // decision, not a refactor.
      expect(policies.map((p) => p.policyname)).toEqual([]);
    });

    it.each(TABLES)('%s privileges match the platform-table posture', async (tableName) => {
      const [priv] = await db<
        {
          anon_select: boolean;
          anon_insert: boolean;
          auth_select: boolean;
          auth_insert: boolean;
          service_select: boolean;
          service_insert: boolean;
          service_update: boolean;
          service_delete: boolean;
        }[]
      >`
        select
          has_table_privilege('anon',          ${tableName}, 'SELECT') as anon_select,
          has_table_privilege('anon',          ${tableName}, 'INSERT') as anon_insert,
          has_table_privilege('authenticated', ${tableName}, 'SELECT') as auth_select,
          has_table_privilege('authenticated', ${tableName}, 'INSERT') as auth_insert,
          has_table_privilege('service_role',  ${tableName}, 'SELECT') as service_select,
          has_table_privilege('service_role',  ${tableName}, 'INSERT') as service_insert,
          has_table_privilege('service_role',  ${tableName}, 'UPDATE') as service_update,
          has_table_privilege('service_role',  ${tableName}, 'DELETE') as service_delete
      `;
      expect(priv).toBeDefined();
      expect(
        { select: priv!.anon_select, insert: priv!.anon_insert },
        `anon must hold nothing on ${tableName}`,
      ).toEqual({ select: false, insert: false });
      expect(
        { select: priv!.auth_select, insert: priv!.auth_insert },
        `authenticated must hold nothing on ${tableName}`,
      ).toEqual({ select: false, insert: false });
      expect(
        {
          select: priv!.service_select,
          insert: priv!.service_insert,
          update: priv!.service_update,
          delete: priv!.service_delete,
        },
        `service_role must retain CRUD on ${tableName}`,
      ).toEqual({ select: true, insert: true, update: true, delete: true });
    });

    /**
     * Only the push table. `platform_admin_preferences` is keyed on `user_id`
     * with no bigserial, so it HAS no sequence — asserting one here would fail
     * on `42P01` and say nothing about the lockdown.
     */
    it('platform_admin_push_subscriptions_id_seq is revoked from anon/authenticated', async () => {
      const [priv] = await db<{ anon: boolean; auth: boolean; service: boolean }[]>`
        select
          has_sequence_privilege('anon',          'platform_admin_push_subscriptions_id_seq', 'USAGE') as anon,
          has_sequence_privilege('authenticated', 'platform_admin_push_subscriptions_id_seq', 'USAGE') as auth,
          has_sequence_privilege('service_role',  'platform_admin_push_subscriptions_id_seq', 'USAGE') as service
      `;
      expect(priv).toBeDefined();
      // Revoking only the table leaves it looking locked down while an INSERT
      // path stays reachable — the trap 0053 recorded.
      expect({ anon: priv!.anon, auth: priv!.auth }).toEqual({ anon: false, auth: false });
      expect(priv!.service, 'service_role must keep the sequence').toBe(true);
    });

    it('platform_admin_preferences has no sequence to revoke', async () => {
      // Pins the asymmetry as a DECISION rather than leaving a reader to wonder
      // whether a sequence revoke was forgotten: the table is keyed on user_id.
      const rows = await db<{ sequence_name: string }[]>`
        select sequence_name from information_schema.sequences
         where sequence_schema = 'public'
           and sequence_name like 'platform_admin_preferences%'
      `;
      expect(rows.map((r) => r.sequence_name)).toEqual([]);
    });
  });

  describe('the privileged path and the CHECKs', () => {
    it('upserts a preferences row on user_id and keeps the jsonb shapes', async () => {
      /*
       * Rolled back by throwing the sentinel rather than by a blanket
       * `.catch(() => {})`, which would swallow a genuinely failing assertion
       * and let the test pass having proven nothing. Only the sentinel is
       * absorbed; anything else rethrows.
       */
      let observed: {
        rowsAfterSecondWrite: number;
        readAt: string | null;
        prefs: Record<string, unknown>;
        fingerprints: string[];
      } | null = null;

      const userId = randomUUID();

      try {
        await db.begin(async (rawTx) => {
          const tx = tagged(rawTx);
          await tx`insert into platform_admin_preferences (user_id) values (${userId}::uuid)`;

          // The upsert the console actually performs: one row per operator, so
          // a second write must UPDATE rather than raise or duplicate.
          await tx`
            insert into platform_admin_preferences
              (user_id, notifications_read_at, alert_prefs, push_sent_fingerprints)
            values (
              ${userId}::uuid,
              now(),
              ${tx.json({ errorSpikes: true, errorSpikeThreshold: 10 })}::jsonb,
              ${tx.json(['abc123'])}::jsonb
            )
            on conflict (user_id) do update set
              notifications_read_at = excluded.notifications_read_at,
              alert_prefs = excluded.alert_prefs,
              push_sent_fingerprints = excluded.push_sent_fingerprints,
              updated_at = now()
          `;

          const [count] = await tx<{ n: number }[]>`
            select count(*)::int as n from platform_admin_preferences where user_id = ${userId}::uuid
          `;
          const [row] = await tx<
            {
              notifications_read_at: string | null;
              alert_prefs: Record<string, unknown>;
              push_sent_fingerprints: string[];
            }[]
          >`
            select notifications_read_at, alert_prefs, push_sent_fingerprints
              from platform_admin_preferences where user_id = ${userId}::uuid
          `;

          observed = {
            rowsAfterSecondWrite: count!.n,
            readAt: row!.notifications_read_at,
            prefs: row!.alert_prefs,
            fingerprints: row!.push_sent_fingerprints,
          };
          throw ROLLBACK_SENTINEL;
        });
      } catch (err) {
        if (err !== ROLLBACK_SENTINEL) throw err;
      }

      // Asserted outside the transaction so a failure surfaces as a failure and
      // not as "the transaction rolled back", which it does either way.
      expect(observed, 'the transaction body should have run to the sentinel').not.toBeNull();
      // One row, not two: this is the control for the upsert claim. Without it
      // a migration that dropped the primary key would leave two rows and every
      // other assertion below would still read the first one and pass.
      expect(observed!.rowsAfterSecondWrite, 'user_id is the primary key').toBe(1);
      expect(observed!.readAt, 'the watermark should have been written').not.toBeNull();
      expect(observed!.prefs).toEqual({ errorSpikes: true, errorSpikeThreshold: 10 });
      expect(observed!.fingerprints).toEqual(['abc123']);
    });

    it('defaults alert_prefs to {} and push_sent_fingerprints to []', async () => {
      let observed: { prefs: unknown; fingerprints: unknown; readAt: string | null } | null = null;
      const userId = randomUUID();
      try {
        await db.begin(async (rawTx) => {
          const tx = tagged(rawTx);
          await tx`insert into platform_admin_preferences (user_id) values (${userId}::uuid)`;
          const [row] = await tx<
            { alert_prefs: unknown; push_sent_fingerprints: unknown; notifications_read_at: string | null }[]
          >`
            select alert_prefs, push_sent_fingerprints, notifications_read_at
              from platform_admin_preferences where user_id = ${userId}::uuid
          `;
          observed = {
            prefs: row!.alert_prefs,
            fingerprints: row!.push_sent_fingerprints,
            readAt: row!.notifications_read_at,
          };
          throw ROLLBACK_SENTINEL;
        });
      } catch (err) {
        if (err !== ROLLBACK_SENTINEL) throw err;
      }
      expect(observed).not.toBeNull();
      expect(observed!.prefs).toEqual({});
      expect(observed!.fingerprints).toEqual([]);
      // Null, not the epoch: never having marked anything read is its own state.
      expect(observed!.readAt).toBeNull();
    });

    it.each([
      // [what is wrong, alert_prefs literal, push_sent_fingerprints literal]
      ['alert_prefs is an array', `'[]'::jsonb`, `'[]'::jsonb`],
      ['alert_prefs is a jsonb null', `'null'::jsonb`, `'[]'::jsonb`],
      ['alert_prefs is a scalar', `'3'::jsonb`, `'[]'::jsonb`],
      ['push_sent_fingerprints is an object', `'{}'::jsonb`, `'{}'::jsonb`],
      ['push_sent_fingerprints is a jsonb null', `'{}'::jsonb`, `'null'::jsonb`],
    ])('rejects a row where %s', async (_what, prefsValue, fingerprintsValue) => {
      let error: unknown;
      try {
        await db.unsafe(
          `insert into platform_admin_preferences (user_id, alert_prefs, push_sent_fingerprints)
           values ('${randomUUID()}'::uuid, ${prefsValue}, ${fingerprintsValue})`,
        );
      } catch (err) {
        error = err;
      }
      // NOT NULL does not exclude a jsonb null, an array or a scalar — a jsonb
      // null is a VALUE. The CHECK is the only thing that does.
      expect(error, 'the jsonb_typeof CHECK should have refused the row').toBeDefined();
      expect((error as { code?: string }).code).toBe('23514');
    });

    it('rejects a non-https push endpoint', async () => {
      for (const endpoint of ['http://push.example/abc', 'file:///etc/passwd']) {
        let error: unknown;
        try {
          await db`
            insert into platform_admin_push_subscriptions (user_id, endpoint, p256dh, auth)
            values (${randomUUID()}::uuid, ${endpoint}, 'k', 'a')
          `;
        } catch (err) {
          error = err;
        }
        expect(
          error,
          `platform_admin_push_subscriptions_endpoint_https should have refused ${endpoint}`,
        ).toBeDefined();
        expect((error as { code?: string }).code).toBe('23514');
      }
    });

    it('accepts an https endpoint — the control for the CHECK above', async () => {
      // Without this, a migration that refused EVERY endpoint would pass the
      // rejection cases and look like a working constraint.
      let observed: number | null = null;
      try {
        await db.begin(async (rawTx) => {
          const tx = tagged(rawTx);
          const [row] = await tx<{ id: number }[]>`
            insert into platform_admin_push_subscriptions (user_id, endpoint, p256dh, auth)
            values (${randomUUID()}::uuid, ${'https://push.example/' + randomUUID()}, 'k', 'a')
            returning id
          `;
          observed = row!.id;
          throw ROLLBACK_SENTINEL;
        });
      } catch (err) {
        if (err !== ROLLBACK_SENTINEL) throw err;
      }
      expect(observed, 'an https endpoint should have been accepted').not.toBeNull();
    });

    it('rejects a duplicate endpoint', async () => {
      const endpoint = `https://push.example/${randomUUID()}`;
      let error: unknown;
      try {
        await db.begin(async (rawTx) => {
          const tx = tagged(rawTx);
          for (const _ of [0, 1]) {
            await tx`
              insert into platform_admin_push_subscriptions (user_id, endpoint, p256dh, auth)
              values (${randomUUID()}::uuid, ${endpoint}, 'k', 'a')
            `;
          }
          throw ROLLBACK_SENTINEL;
        });
      } catch (err) {
        if (err === ROLLBACK_SENTINEL) {
          throw new Error('the second insert should have been refused, but both succeeded');
        }
        error = err;
      }
      expect(error, 'the UNIQUE on endpoint should have refused the second row').toBeDefined();
      expect((error as { code?: string }).code).toBe('23505');
    });
  });
});
