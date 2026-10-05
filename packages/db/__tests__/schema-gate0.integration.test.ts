/**
 * Gate 0 schema sign-off integration test.
 *
 * Validates the Gate 0 tables, enum values, foreign-key ON DELETE actions and
 * package exports against the live, fully migrated `public` schema — i.e. what
 * the whole migration chain actually produces, which a later migration can
 * break.
 *
 * It used to replay `migrations/0000_flashy_toro.sql` into a throwaway schema.
 * The 2026-05-06 drizzle re-baseline (#191) moved that file to `_archive/`, so
 * `beforeAll` threw ENOENT and the file was red for five months.
 */

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

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

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

  beforeAll(() => {
    sql = postgres(databaseUrl!, { prepare: false, max: 1 });
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }
  });

  it('creates all expected tables', async () => {
    if (!sql) {
      throw new Error('Gate 0 setup did not initialize SQL client');
    }

    const rows = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
      order by table_name
    `;

    // public holds every later table too, so assert containment.
    expect(rows.map((row) => row.table_name)).toEqual(expect.arrayContaining([...expectedTables]));
  });

  it('creates enums with exact accepted labels', async () => {
    if (!sql) {
      throw new Error('Gate 0 setup did not initialize SQL client');
    }

    const rows = await sql<{ enum_name: string; enum_label: string }[]>`
      select t.typname as enum_name, e.enumlabel as enum_label
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname = any(${Object.keys(expectedEnumLabels)})
      order by t.typname, e.enumsortorder
    `;

    const enumMap = rows.reduce<Record<string, string[]>>((acc, row) => {
      const labels = acc[row.enum_name] ?? [];
      labels.push(row.enum_label);
      acc[row.enum_name] = labels;
      return acc;
    }, {});

    expect(enumMap.community_type).toEqual(expectedEnumLabels.community_type);
  });

  it('rejects invalid enum values', async () => {
    if (!sql) {
      throw new Error('Gate 0 setup did not initialize SQL client');
    }

    await expect(
      sql.unsafe(`select 'not_a_type'::public.community_type`),
    ).rejects.toThrow();
  });

  it('enforces ON DELETE actions on every FK', async () => {
    if (!sql) {
      throw new Error('Gate 0 setup did not initialize SQL client');
    }

    const rows = await sql<{ conname: string; definition: string }[]>`
      select c.conname, pg_get_constraintdef(c.oid) as definition
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      where c.contype = 'f'
        and n.nspname = 'public'
        and c.conname = any(${Object.keys(expectedFkOnDelete)})
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
    expect(dbExports).toHaveProperty('communities');
    expect(dbExports).toHaveProperty('users');
    expect(dbExports).toHaveProperty('userRoles');
    expect(dbExports).toHaveProperty('units');
    expect(dbExports).toHaveProperty('documentCategories');
    expect(dbExports).toHaveProperty('documents');
    expect(dbExports).toHaveProperty('notificationPreferences');
  });
});
