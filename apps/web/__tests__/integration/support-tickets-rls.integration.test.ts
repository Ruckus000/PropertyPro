/**
 * 0072 — `support_tickets` / `support_ticket_events` are platform-scoped and
 * locked to the 0068 posture: RLS enabled and FORCEd, zero policies, table and
 * sequence privileges revoked from anon/authenticated and granted to
 * service_role only.
 *
 * Pinned here, against a real server, because nothing else can pin it. Every
 * route and service test for tickets mocks the database, so a migration that
 * silently lost its REVOKE would leave the whole triage queue — descriptions
 * and operator notes included — readable through the anon key that ships in the
 * browser bundle, with every unit test still green.
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
 * service_role does, so it stands in for the privileged writer; the GRANT that
 * makes service_role privileged in prod is asserted directly out of the
 * catalogue instead, which is how `local-supabase-post-migrate.sql` derived
 * production's posture in the first place.
 */
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

import { getDescribeDb, requireDatabaseUrlInCI } from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('support_tickets RLS integration tests');

const describeDb = getDescribeDb();

/** Thrown to make `sql.begin` roll back a transaction whose writes we do not want to keep. */
const ROLLBACK_SENTINEL = Symbol('support-tickets-rollback');

/**
 * Narrow a transaction handle back to the callable `Sql` interface.
 *
 * postgres.js declares `TransactionSql` as `Omit<Sql<T>, 'begin' | 'end' | …>`,
 * and TypeScript's `Omit` silently drops CALL SIGNATURES along with the named
 * keys. So `` tx`select 1` `` — which is the library's own documented usage and
 * works perfectly at runtime — does not type-check. This is a defect in the
 * package's types, not a claim about the value, which is why the cast is
 * isolated here with a name rather than sprinkled at each call site.
 */
const tagged = (tx: postgres.TransactionSql): postgres.Sql => tx as unknown as postgres.Sql;

describeDb('support_tickets lockdown (0072)', () => {
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
      // Caught OUTSIDE `begin`, not inside it: postgres.js rolls the
      // transaction back and re-raises the original PostgresError from the
      // `begin` promise, so an inner try/catch leaves `error` set AND lets the
      // outer promise reject unhandled. That cost a red run to learn.
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
      it(`${role} cannot read or write support_tickets`, async () => {
        await deniedInOwnTransaction(
          role,
          'SELECT on support_tickets',
          (tx) => tx`select id from support_tickets limit 1`,
        );
        await deniedInOwnTransaction(role, 'INSERT on support_tickets', (tx) =>
          tx`insert into support_tickets (title, priority, category, status, created_by)
             values ('x','low','other','open', ${randomUUID()}::uuid)`,
        );
      });

      it(`${role} cannot read or write support_ticket_events`, async () => {
        await deniedInOwnTransaction(
          role,
          'SELECT on support_ticket_events',
          (tx) => tx`select id from support_ticket_events limit 1`,
        );
        await deniedInOwnTransaction(role, 'INSERT on support_ticket_events', (tx) =>
          tx`insert into support_ticket_events (ticket_id, kind, actor_user_id)
             values (1, 'note', ${randomUUID()}::uuid)`,
        );
      });
    }
  });

  describe('table posture', () => {
    it.each(['support_tickets', 'support_ticket_events'])(
      '%s has RLS enabled AND forced, with zero policies',
      async (tableName) => {
        const [row] = await db<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
          select c.relrowsecurity, c.relforcerowsecurity
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = ${tableName}
        `;
        // Anti-vacuity: an absent table would leave `row` undefined and every
        // toBe() below comparing undefined, which is a failure, not a pass —
        // but say so explicitly rather than relying on that.
        expect(row, `${tableName} should exist`).toBeDefined();
        expect(row?.relrowsecurity, `${tableName} should have RLS enabled`).toBe(true);
        expect(row?.relforcerowsecurity, `${tableName} should have RLS forced`).toBe(true);

        const policies = await db<{ policyname: string }[]>`
          select policyname from pg_policies
           where schemaname = 'public' and tablename = ${tableName}
        `;
        // Zero is the deny-everyone default and the entire access model here.
        // A policy appearing would mean somebody decided a non-privileged role
        // should see tickets, which is a product decision, not a refactor.
        expect(policies.map((p) => p.policyname)).toEqual([]);
      },
    );

    it.each(['support_tickets', 'support_ticket_events'])(
      '%s privileges match the platform-table posture',
      async (tableName) => {
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
            anon_seq: boolean;
            auth_seq: boolean;
            service_seq: boolean;
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
            has_table_privilege('service_role',  ${tableName}, 'DELETE') as service_delete,
            has_sequence_privilege('anon',          ${tableName + '_id_seq'}, 'USAGE') as anon_seq,
            has_sequence_privilege('authenticated', ${tableName + '_id_seq'}, 'USAGE') as auth_seq,
            has_sequence_privilege('service_role',  ${tableName + '_id_seq'}, 'USAGE') as service_seq
        `;
        expect(priv).toBeDefined();
        expect(
          { select: priv!.anon_select, insert: priv!.anon_insert, sequence: priv!.anon_seq },
          `anon must hold nothing on ${tableName}`,
        ).toEqual({ select: false, insert: false, sequence: false });
        expect(
          { select: priv!.auth_select, insert: priv!.auth_insert, sequence: priv!.auth_seq },
          `authenticated must hold nothing on ${tableName}`,
        ).toEqual({ select: false, insert: false, sequence: false });
        // The sequence matters as much as the table: revoking only the table
        // leaves it looking locked down while an INSERT path stays reachable.
        expect(
          {
            select: priv!.service_select,
            insert: priv!.service_insert,
            update: priv!.service_update,
            delete: priv!.service_delete,
            sequence: priv!.service_seq,
          },
          `service_role must retain CRUD on ${tableName}`,
        ).toEqual({ select: true, insert: true, update: true, delete: true, sequence: true });
      },
    );
  });

  describe('the privileged path, the CHECKs and the cascade', () => {
    it('creates a ticket with its timeline, and deleting it cascades the events', async () => {
      /*
       * Rolled back by throwing the sentinel rather than by `await tx\`rollback\``
       * plus a blanket `.catch(() => {})`: a blanket catch on the outer promise
       * swallows a genuinely failing assertion, so the test would pass having
       * proven nothing. Here only the sentinel is absorbed — anything else
       * rethrows and the test goes red. The rollback keeps this file
       * side-effect-free against the shared CI database.
       */
      let observed: { eventsBefore: number; eventsAfter: number; ticketsAfter: number } | null =
        null;

      try {
        await db.begin(async (rawTx) => {
          const tx = tagged(rawTx);
          const [ticket] = await tx<{ id: number }[]>`
            insert into support_tickets (title, priority, category, status, created_by)
            values ('PDF uploads fail', 'high', 'site', 'open', ${randomUUID()}::uuid)
            returning id
          `;
          expect(ticket, 'the insert should have returned a row').toBeDefined();
          const ticketId = ticket!.id;

          await tx`
            insert into support_ticket_events (ticket_id, kind, body, actor_user_id)
            values (${ticketId}, 'created', null, ${randomUUID()}::uuid)
          `;
          const [before] = await tx<{ n: number }[]>`
            select count(*)::int as n from support_ticket_events where ticket_id = ${ticketId}
          `;

          await tx`delete from support_tickets where id = ${ticketId}`;

          const [after] = await tx<{ n: number }[]>`
            select count(*)::int as n from support_ticket_events where ticket_id = ${ticketId}
          `;
          const [ticketsAfter] = await tx<{ n: number }[]>`
            select count(*)::int as n from support_tickets where id = ${ticketId}
          `;

          observed = {
            eventsBefore: before!.n,
            eventsAfter: after!.n,
            ticketsAfter: ticketsAfter!.n,
          };
          throw ROLLBACK_SENTINEL;
        });
      } catch (err) {
        if (err !== ROLLBACK_SENTINEL) throw err;
      }

      // Asserted outside the transaction so a failure surfaces as a failure and
      // not as "the transaction rolled back", which is what it does either way.
      expect(observed, 'the transaction body should have run to the sentinel').not.toBeNull();
      // `eventsBefore` is the control for the cascade assertion: without it, a
      // migration that failed to insert the event at all would also report 0
      // afterwards and read as a passing cascade.
      expect(observed!.eventsBefore, 'the event should have been written').toBe(1);
      expect(observed!.eventsAfter, 'deleting the ticket should cascade its events').toBe(0);
      expect(observed!.ticketsAfter).toBe(0);
    });

    it.each([
      ['priority', "'urgent'", "'other'", "'open'"],
      ['category', "'low'", "'legal'", "'open'"],
      ['status', "'low'", "'other'", "'archived'"],
    ])('rejects an out-of-vocabulary %s', async (_field, priority, category, status) => {
      let error: unknown;
      try {
        await db.unsafe(
          `insert into support_tickets (title, priority, category, status, created_by)
           values ('x', ${priority}, ${category}, ${status}, '${randomUUID()}'::uuid)`,
        );
      } catch (err) {
        error = err;
      }
      expect(error, 'the CHECK should have refused the row').toBeDefined();
      expect((error as { code?: string }).code).toBe('23514');
    });

    it('rejects an empty title and one over 200 characters', async () => {
      for (const title of ['', 'x'.repeat(201)]) {
        let error: unknown;
        try {
          await db`
            insert into support_tickets (title, created_by)
            values (${title}, ${randomUUID()}::uuid)
          `;
        } catch (err) {
          error = err;
        }
        expect(
          error,
          `support_tickets_title_check should have refused a ${title.length}-character title`,
        ).toBeDefined();
        expect((error as { code?: string }).code).toBe('23514');
      }
    });

    it('rejects an out-of-vocabulary event kind', async () => {
      let error: unknown;
      try {
        await db`
          insert into support_ticket_events (ticket_id, kind, actor_user_id)
          values (1, 'escalated', ${randomUUID()}::uuid)
        `;
      } catch (err) {
        error = err;
      }
      expect(error, 'the kind CHECK should have refused the row').toBeDefined();
      // 23514 and not 23503: CHECK constraints are evaluated before foreign
      // keys, so this is refused on the vocabulary even though ticket_id 1 may
      // not exist. Asserting the SQLSTATE is what keeps the two apart — a bare
      // `toThrow()` here would pass on the FK violation and prove nothing about
      // the CHECK.
      expect((error as { code?: string }).code).toBe('23514');
    });
  });
});
