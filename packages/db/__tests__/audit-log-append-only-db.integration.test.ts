/**
 * compliance_audit_log append-only guard, exercised against the live, fully
 * migrated `public` schema — so a later migration that drops or weakens
 * `compliance_audit_log_append_only_guard` turns this red.
 *
 * It used to replay three migration files into a throwaway schema; the
 * 2026-05-06 drizzle re-baseline (#191) moved them to `_archive/`, so
 * `beforeAll` threw ENOENT and the file was red for five months.
 *
 * Every case runs in ONE transaction that is always rolled back, and each
 * expected rejection runs in a savepoint so the transaction survives it. No row
 * persists and the trigger is never disabled, so this file needs no place on
 * scripts/verify-audit-log-trigger-overrides.ts's approved list.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

type TxSql = postgres.TransactionSql;

/** Thrown at the end of every case so `sql.begin` rolls the transaction back. */
class RollbackSentinel extends Error {}

describeDb('compliance_audit_log append-only (DB integration)', () => {
  let sql: postgres.Sql;

  beforeAll(() => {
    sql = postgres(databaseUrl!, { prepare: false, max: 1 });
  });

  afterAll(async () => {
    await sql.end();
  });

  async function inRolledBackTransaction(fn: (tx: TxSql) => Promise<void>): Promise<void> {
    try {
      await sql.begin(async (tx) => {
        await fn(tx);
        throw new RollbackSentinel();
      });
    } catch (error) {
      if (!(error instanceof RollbackSentinel)) {
        throw error;
      }
    }
  }

  async function createAuditLogRecord(tx: TxSql, prefix: string): Promise<number> {
    const slug = `${prefix}-community-${randomUUID().slice(0, 8)}`;
    const email = `${prefix}-${randomUUID().slice(0, 8)}@example.com`;
    const userId = randomUUID();

    const communityRows = await tx.unsafe<{ id: string }[]>(
      `insert into public.communities (name, slug, community_type, timezone)
       values ($1, $2, 'condo_718', 'America/New_York')
       returning id`,
      [`${prefix} Community`, slug],
    );

    const communityId = Number(communityRows[0]?.id);
    if (!Number.isFinite(communityId)) {
      throw new Error('Failed to create test community');
    }

    await tx.unsafe(
      `insert into public.users (id, email, full_name) values ($1, $2, $3)`,
      [userId, email, `${prefix} User`],
    );

    const resourceId = `__p1_27c_test__${prefix}__${randomUUID().slice(0, 8)}`;
    const rows = await tx.unsafe<{ id: string }[]>(
      `insert into public.compliance_audit_log
        (user_id, community_id, action, resource_type, resource_id, old_values, new_values, metadata)
       values ($1, $2, 'create', 'document', $3, null, '{"ok":true}'::jsonb, null)
       returning id`,
      [userId, communityId, resourceId],
    );

    const id = Number(rows[0]?.id);
    if (!Number.isFinite(id)) {
      throw new Error('Failed to create compliance_audit_log record');
    }

    return id;
  }

  /** Runs `statement` in a savepoint and returns the error it raised. */
  async function rejectionOf(tx: TxSql, statement: string, params: number[]): Promise<unknown> {
    try {
      await tx.savepoint((sp) => sp.unsafe(statement, params));
    } catch (error) {
      return error;
    }
    throw new Error(`expected the append-only guard to reject: ${statement}`);
  }

  function expectGuardRejection(error: unknown): void {
    expect(error).toBeInstanceOf(postgres.PostgresError);
    expect((error as postgres.PostgresError).message).toMatch(/append-only/i);
    // check_violation is the ERRCODE the guard raises with — pins that the
    // guard trigger itself fired, not some other error that mentions the term.
    expect((error as postgres.PostgresError).code).toBe('23514');
  }

  it('allows INSERT into compliance_audit_log', async () => {
    await inRolledBackTransaction(async (tx) => {
      const id = await createAuditLogRecord(tx, 'insert');
      expect(id).toBeGreaterThan(0);
    });
  });

  it('rejects direct UPDATE on compliance_audit_log', async () => {
    await inRolledBackTransaction(async (tx) => {
      const id = await createAuditLogRecord(tx, 'update');
      expectGuardRejection(
        await rejectionOf(tx, `update public.compliance_audit_log set action = 'update' where id = $1`, [id]),
      );
    });
  });

  it('rejects direct DELETE on compliance_audit_log', async () => {
    await inRolledBackTransaction(async (tx) => {
      const id = await createAuditLogRecord(tx, 'delete');
      expectGuardRejection(
        await rejectionOf(tx, `delete from public.compliance_audit_log where id = $1`, [id]),
      );
    });
  });
});
