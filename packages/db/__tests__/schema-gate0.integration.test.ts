/**
 * Gate 0 schema sign-off integration test.
 *
 * Executes migration SQL against a temporary schema on a live Postgres instance,
 * then validates tables, enum values, foreign-key ON DELETE actions, and package exports.
 */

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import * as dbExports from '../src/index';
import type {
  Community,
  Document,
  DocumentCategory,
  NewCommunity,
  NewDocument,
  NewDocumentCategory,
  NewNotificationPreference,
  NewUnit,
  NewUser,
  NewUserRoleRecord,
  NotificationPreference,
  Unit,
  User,
  UserRoleRecord,
} from '../src/index';

const describeDb = process.env.DIRECT_URL ? describe : describe.skip;

const expectedTables = [
  'communities',
  'users',
  'user_roles',
  'units',
  'document_categories',
  'documents',
  'notification_preferences',
] as const;

const expectedEnumLabels: Record<string, string[]> = {
  community_type: ['condo_718', 'hoa_720', 'apartment'],
  user_role: [
    'owner',
    'tenant',
    'board_member',
    'board_president',
    'cam',
    'site_manager',
    'property_manager_admin',
  ],
};

const expectedFkOnDelete: Record<string, 'cascade' | 'set null' | 'restrict'> = {
  user_roles_user_id_users_id_fk: 'cascade',
  user_roles_community_id_communities_id_fk: 'cascade',
  user_roles_unit_id_units_id_fk: 'set null',
  units_community_id_communities_id_fk: 'cascade',
  units_owner_user_id_users_id_fk: 'set null',
  document_categories_community_id_communities_id_fk: 'cascade',
  documents_community_id_communities_id_fk: 'cascade',
  documents_category_id_document_categories_id_fk: 'restrict',
  documents_uploaded_by_users_id_fk: 'set null',
  notification_preferences_user_id_users_id_fk: 'cascade',
  notification_preferences_community_id_communities_id_fk: 'cascade',
};

const migrationPath = path.resolve(
  process.cwd(),
  'migrations/0000_flashy_toro.sql',
);

type TypeExportSmoke = [
  Community,
  NewCommunity,
  User,
  NewUser,
  UserRoleRecord,
  NewUserRoleRecord,
  Unit,
  NewUnit,
  DocumentCategory,
  NewDocumentCategory,
  Document,
  NewDocument,
  NotificationPreference,
  NewNotificationPreference,
];

// compile-time only smoke check for type exports from package root
void (null as unknown as TypeExportSmoke);

describeDb('Gate 0: schema sign-off', () => {
  let sql: postgres.Sql | undefined;
  let schemaName: string | undefined;

  beforeAll(async () => {
    sql = postgres(process.env.DIRECT_URL!, { prepare: false, max: 1 });
    schemaName = `gate0_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;

    await sql.unsafe(`create schema "${schemaName}"`);
    await sql.unsafe(`set search_path to "${schemaName}"`);

    const rawMigration = await readFile(migrationPath, 'utf8');
    const statements = rawMigration
      .split('--> statement-breakpoint')
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0)
      .map((chunk) => chunk.replaceAll('"public".', `"${schemaName}".`));

    for (const statement of statements) {
      await sql.unsafe(statement);
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

  it('creates all expected tables', async () => {
    if (!sql || !schemaName) {
      throw new Error('Gate 0 setup did not initialize SQL client and schema');
    }

    const rows = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = ${schemaName}
        and table_type = 'BASE TABLE'
      order by table_name
    `;

    expect(rows.map((row) => row.table_name)).toEqual([...expectedTables].sort());
  });

  it('creates enums with exact accepted labels', async () => {
    if (!sql || !schemaName) {
      throw new Error('Gate 0 setup did not initialize SQL client and schema');
    }

    const rows = await sql<{ enum_name: string; enum_label: string }[]>`
      select t.typname as enum_name, e.enumlabel as enum_label
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = ${schemaName}
      order by t.typname, e.enumsortorder
    `;

    const enumMap = rows.reduce<Record<string, string[]>>((acc, row) => {
      const labels = acc[row.enum_name] ?? [];
      labels.push(row.enum_label);
      acc[row.enum_name] = labels;
      return acc;
    }, {});

    expect(enumMap.community_type).toEqual(expectedEnumLabels.community_type);
    expect(enumMap.user_role).toEqual(expectedEnumLabels.user_role);
  });

  it('rejects invalid enum values', async () => {
    if (!sql || !schemaName) {
      throw new Error('Gate 0 setup did not initialize SQL client and schema');
    }

    await expect(
      sql.unsafe(`select 'not_a_type'::"${schemaName}".community_type`),
    ).rejects.toThrow();

    await expect(
      sql.unsafe(`select 'not_a_role'::"${schemaName}".user_role`),
    ).rejects.toThrow();
  });

  it('enforces ON DELETE actions on every FK', async () => {
    if (!sql || !schemaName) {
      throw new Error('Gate 0 setup did not initialize SQL client and schema');
    }

    const rows = await sql<{ conname: string; definition: string }[]>`
      select c.conname, pg_get_constraintdef(c.oid) as definition
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      where c.contype = 'f'
        and n.nspname = ${schemaName}
      order by c.conname
    `;

    const actualOnDelete = rows.reduce<Record<string, string>>((acc, row) => {
      const match = row.definition.match(/ON DELETE\s+(CASCADE|SET NULL|RESTRICT)/i);
      if (match) {
        acc[row.conname] = match[1]!.toLowerCase();
      }
      return acc;
    }, {});

    expect(actualOnDelete).toEqual(expectedFkOnDelete);
  });

  it('exports schema symbols and inferred types from package root', () => {
    expect(dbExports).toHaveProperty('communityTypeEnum');
    expect(dbExports).toHaveProperty('userRoleEnum');
    expect(dbExports).toHaveProperty('communities');
    expect(dbExports).toHaveProperty('users');
    expect(dbExports).toHaveProperty('userRoles');
    expect(dbExports).toHaveProperty('units');
    expect(dbExports).toHaveProperty('documentCategories');
    expect(dbExports).toHaveProperty('documents');
    expect(dbExports).toHaveProperty('notificationPreferences');
  });
});
