/**
 * compliance_audit_log is append-only at the DATABASE layer: the
 * `compliance_audit_log_append_only_guard` trigger (baseline 0000, function
 * re-pinned in 0039) rejects every UPDATE and DELETE.
 *
 * Asserted against the LIVE migrated `public` table — the one production runs.
 * This file used to replay three pre-re-baseline migration files into a scratch
 * schema; those moved to `migrations/_archive/`, so it proved nothing about the
 * current schema and failed on ENOENT.
 *
 * Every case runs inside a transaction that is always rolled back. That is the
 * only clean way to test an append-only table: a committed row could never be
 * deleted afterwards (and its community FK is ON DELETE restrict), so each run
 * would leak permanently.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

class Rollback extends Error {}

describeDb('compliance_audit_log append-only (DB integration)', () => {
  let sql: postgres.Sql;

  beforeAll(() => {
    sql = postgres(databaseUrl!, { prepare: false, max: 1 });
  });

  afterAll(async () => {
    await sql.end();
  });

  /** Runs `fn` in a transaction that is rolled back whatever happens. */
  async function inRolledBackTransaction(
    fn: (tx: postgres.TransactionSql) => Promise<void>,
  ): Promise<void> {
    await expect(
      sql.begin(async (tx) => {
        await fn(tx);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  }

  async function insertAuditRow(tx: postgres.TransactionSql, prefix: string): Promise<number> {
    const tag = `${prefix}-${randomUUID().slice(0, 8)}`;
    const [community] = await tx<{ id: string }[]>`
      insert into communities (name, slug, community_type, timezone)
      values (${`Audit ${tag}`}, ${`audit-append-only-${tag}`}, 'condo_718', 'America/New_York')
      returning id`;
    const [row] = await tx<{ id: string }[]>`
      insert into compliance_audit_log
        (user_id, community_id, action, resource_type, resource_id, new_values)
      values (null, ${community!.id}, 'create', 'document', ${tag}, ${tx.json({ ok: true })})
      returning id`;
    return Number(row!.id);
  }

  it('allows INSERT into compliance_audit_log', async () => {
    await inRolledBackTransaction(async (tx) => {
      const id = await insertAuditRow(tx, 'insert');
      expect(id).toBeGreaterThan(0);
    });
  });

  it('rejects direct UPDATE on compliance_audit_log', async () => {
    await inRolledBackTransaction(async (tx) => {
      const id = await insertAuditRow(tx, 'update');
      // A savepoint, so the rejected statement does not abort the transaction
      // before the assertion is read.
      await expect(
        tx.savepoint((sp) => sp`update compliance_audit_log set action = 'update' where id = ${id}`),
      ).rejects.toThrow(/append-only: UPDATE is not permitted/);
    });
  });

  it('rejects direct DELETE on compliance_audit_log', async () => {
    await inRolledBackTransaction(async (tx) => {
      const id = await insertAuditRow(tx, 'delete');
      await expect(
        tx.savepoint((sp) => sp`delete from compliance_audit_log where id = ${id}`),
      ).rejects.toThrow(/append-only: DELETE is not permitted/);
    });
  });
});
