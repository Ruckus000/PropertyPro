import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const describeDb = process.env.DIRECT_URL || process.env.DATABASE_URL ? describe : describe.skip;

const migrationPaths = [
  path.resolve(process.cwd(), 'migrations/0000_flashy_toro.sql'),
  path.resolve(process.cwd(), 'migrations/0001_condemned_mikhail_rasputin.sql'),
  path.resolve(process.cwd(), 'migrations/0005_append_only_audit_log.sql'),
];

type SqlClient = postgres.Sql;

async function applyMigration(sql: SqlClient, schemaName: string, filePath: string): Promise<void> {
  const rawMigration = await readFile(filePath, 'utf8');
  const statements = rawMigration
    .split('--> statement-breakpoint')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => chunk.replaceAll('"public".', `"${schemaName}".`));

  for (const statement of statements) {
    await sql.unsafe(statement);
  }
}

describeDb('compliance_audit_log append-only (DB integration)', () => {
  let sql: SqlClient | undefined;
  let schemaName: string | undefined;

  beforeAll(async () => {
    const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DIRECT_URL or DATABASE_URL is required for append-only DB integration test');
    }

    sql = postgres(url, { prepare: false, max: 1 });
    schemaName = `audit_append_only_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;

    await sql.unsafe(`create schema "${schemaName}"`);
    await sql.unsafe(`set search_path to "${schemaName}"`);

    for (const migrationPath of migrationPaths) {
      await applyMigration(sql, schemaName, migrationPath);
    }
  });

  afterAll(async () => {
    if (sql && schemaName) {
      await sql.unsafe(`drop schema if exists "${schemaName}" cascade`);
    }
    if (sql) {
      await sql.end();
    }
  });

  async function createAuditLogRecord(prefix: string): Promise<number> {
    if (!sql || !schemaName) {
      throw new Error('append-only test setup did not initialize SQL client and schema');
    }

    const slug = `${prefix}-community-${randomUUID().slice(0, 8)}`;
    const email = `${prefix}-${randomUUID().slice(0, 8)}@example.com`;
    const userId = randomUUID();

    const communityRows = await sql.unsafe<{ id: string }[]>(
      `insert into "${schemaName}"."communities" ("name", "slug", "community_type", "timezone")
       values ($1, $2, 'condo_718', 'America/New_York')
       returning "id"`,
      [`${prefix} Community`, slug],
    );

    const communityId = Number(communityRows[0]?.id);
    if (!Number.isFinite(communityId)) {
      throw new Error('Failed to create test community');
    }

    await sql.unsafe(
      `insert into "${schemaName}"."users" ("id", "email", "full_name") values ($1, $2, $3)`,
      [userId, email, `${prefix} User`],
    );

    const resourceId = `__p1_27c_test__${prefix}__${randomUUID().slice(0, 8)}`;
    const rows = await sql.unsafe<{ id: string }[]>(
      `insert into "${schemaName}"."compliance_audit_log"
        ("user_id", "community_id", "action", "resource_type", "resource_id", "old_values", "new_values", "metadata")
       values ($1, $2, 'create', 'document', $3, null, '{"ok":true}'::jsonb, null)
       returning "id"`,
      [userId, communityId, resourceId],
    );

    const id = Number(rows[0]?.id);
    if (!Number.isFinite(id)) {
      throw new Error('Failed to create compliance_audit_log record');
    }

    return id;
  }

  it('allows INSERT into compliance_audit_log', async () => {
    const id = await createAuditLogRecord('insert');
    expect(id).toBeGreaterThan(0);
  });

  it('rejects direct UPDATE on compliance_audit_log', async () => {
    if (!sql || !schemaName) {
      throw new Error('append-only test setup did not initialize SQL client and schema');
    }

    const id = await createAuditLogRecord('update');

    await expect(
      sql.unsafe(
        `update "${schemaName}"."compliance_audit_log" set "action" = 'update' where "id" = $1`,
        [id],
      ),
    ).rejects.toThrow(/append-only/i);
  });

  it('rejects direct DELETE on compliance_audit_log', async () => {
    if (!sql || !schemaName) {
      throw new Error('append-only test setup did not initialize SQL client and schema');
    }

    const id = await createAuditLogRecord('delete');

    await expect(
      sql.unsafe(`delete from "${schemaName}"."compliance_audit_log" where "id" = $1`, [id]),
    ).rejects.toThrow(/append-only/i);
  });
});
