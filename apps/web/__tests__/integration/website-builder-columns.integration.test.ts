/**
 * Migration 0095 — the columns the website builder reads and writes.
 *
 * Six additive columns, one foreign key, three CHECK constraints and one partial
 * index (an EXPAND migration: it is applied to production before the code that
 * uses it). Every service and route test in the later tasks mocks the database,
 * so nothing else would notice if the migration lost a CHECK or a foreign key's
 * ON DELETE rule — the Drizzle schema and the SQL are two hand-checked copies of
 * one fact, and drizzle-kit never compares either with a live server. So this
 * runs against a real Postgres and asserts what the SERVER reports.
 *
 * ## What each case is careful about
 *
 * **Nullable, with no default.** Production already holds rows and the old code
 * keeps inserting without naming these columns until the new code ships. Every
 * column must therefore accept an insert that never mentions it and come back
 * NULL.
 *
 * **A CHECK is asserted by SQLSTATE and constraint name, never by "it threw".**
 * A statement against a column that does not exist also throws (`42703`), so a
 * bare `rejects.toThrow()` would stay green while proving nothing about the
 * constraint. Each rejection must be `23514` AND name the constraint under test.
 * Each is paired with the boundary value on the accepting side, so a constraint
 * that rejects everything cannot pass either.
 *
 * **The foreign key is exercised, not only catalogued.** `confdeltype = 'n'` says
 * SET NULL; deleting a real document is what shows the item survives with the
 * link cleared. The catalog lookup goes by COLUMN, not by constraint name:
 * Postgres truncates identifiers to 63 bytes and the name drizzle-kit gives this
 * foreign key is 66, so a lookup by name would find nothing.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import {
  type TestKitState,
  getDescribeDb,
  initTestKit,
  requireCommunity,
  requireDatabaseUrlInCI,
  seedCommunities,
  teardownTestKit,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('website-builder-columns (migration 0095)');

const describeDb = getDescribeDb();

/** The slice of a postgres.js `PostgresError` these assertions read. */
interface PgError {
  code?: string;
  constraint_name?: string;
}

/**
 * Await a statement that must be refused and hand back the error. Throws if the
 * statement succeeded, so "it was accepted" fails loudly instead of passing as
 * an empty catch.
 */
async function refusal(statement: PromiseLike<unknown>): Promise<PgError> {
  try {
    await statement;
  } catch (error) {
    return error as PgError;
  }
  throw new Error('expected the statement to be refused, but it succeeded');
}

describeDb('website builder columns (migration 0095)', () => {
  let state: TestKitState;
  let communityId: number;
  let itemSeq = 0;

  beforeAll(async () => {
    state = await initTestKit();
    await seedCommunities(
      state,
      MULTI_TENANT_COMMUNITIES.filter((community) => community.key === 'communityA'),
    );
    communityId = requireCommunity(state, 'communityA').id;
  });

  afterAll(async () => {
    await teardownTestKit(state);
  });

  /** A checklist item with none of the new columns set (the shape old code inserts). */
  async function insertChecklistItem(): Promise<number> {
    itemSeq += 1;
    const [row] = await state.sqlClient<{ id: number }[]>`
      INSERT INTO compliance_checklist_items (community_id, template_key, title, category)
      VALUES (${communityId}, ${`718_wb_columns_${state.runSuffix}_${itemSeq}`}, 'Website builder columns probe', 'governing_documents')
      RETURNING id::int AS id
    `;
    return row!.id;
  }

  async function insertDocument(): Promise<number> {
    const [row] = await state.sqlClient<{ id: number }[]>`
      INSERT INTO documents (community_id, title, file_path, file_name, file_size, mime_type)
      VALUES (${communityId}, 'Website builder columns probe', ${`${communityId}/documents/wb-columns-${state.runSuffix}.pdf`}, 'wb-columns.pdf', 1, 'application/pdf')
      RETURNING id::int AS id
    `;
    return row!.id;
  }

  it('adds the four community columns as nullable', async () => {
    const columns = await state.sqlClient<
      { column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]
    >`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'communities'
        AND column_name IN ('short_name', 'office_hours', 'site_live_notice_sent_at', 'site_live_notice_dismissed_at')
      ORDER BY column_name
    `;
    expect(
      columns.map((c) => [c.column_name, c.data_type, c.is_nullable, c.column_default]),
    ).toEqual([
      ['office_hours', 'text', 'YES', null],
      ['short_name', 'text', 'YES', null],
      ['site_live_notice_dismissed_at', 'timestamp with time zone', 'YES', null],
      ['site_live_notice_sent_at', 'timestamp with time zone', 'YES', null],
    ]);

    // The seeded community was inserted by code that has never heard of these
    // columns. It must have succeeded, and left all four empty.
    const [community] = await state.sqlClient`
      SELECT short_name, office_hours, site_live_notice_sent_at, site_live_notice_dismissed_at
      FROM communities WHERE id = ${communityId}
    `;
    expect(community).toEqual({
      short_name: null,
      office_hours: null,
      site_live_notice_sent_at: null,
      site_live_notice_dismissed_at: null,
    });
  });

  it('rejects a 61-character short name', async () => {
    const error = await refusal(
      state.sqlClient`UPDATE communities SET short_name = ${'a'.repeat(61)} WHERE id = ${communityId}`,
    );
    expect(error.code).toBe('23514');
    expect(error.constraint_name).toBe('communities_short_name_len');

    // The accepting side of the boundary, and NULL (a CHECK passes on NULL, and
    // NULL is how "no short name" is stored).
    await state.sqlClient`UPDATE communities SET short_name = ${'a'.repeat(60)} WHERE id = ${communityId}`;
    await state.sqlClient`UPDATE communities SET short_name = NULL WHERE id = ${communityId}`;
  });

  it('rejects 201 characters of office hours', async () => {
    const error = await refusal(
      state.sqlClient`UPDATE communities SET office_hours = ${'a'.repeat(201)} WHERE id = ${communityId}`,
    );
    expect(error.code).toBe('23514');
    expect(error.constraint_name).toBe('communities_office_hours_len');

    await state.sqlClient`UPDATE communities SET office_hours = ${'a'.repeat(200)} WHERE id = ${communityId}`;
    await state.sqlClient`UPDATE communities SET office_hours = NULL WHERE id = ${communityId}`;
  });

  it('adds not_applicable_reason with its length check', async () => {
    const [column] = await state.sqlClient<
      { data_type: string; is_nullable: string; column_default: string | null }[]
    >`
      SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'compliance_checklist_items'
        AND column_name = 'not_applicable_reason'
    `;
    expect(column).toEqual({ data_type: 'text', is_nullable: 'YES', column_default: null });

    const itemId = await insertChecklistItem();
    const [fresh] = await state.sqlClient`
      SELECT not_applicable_reason FROM compliance_checklist_items WHERE id = ${itemId}
    `;
    expect(fresh).toEqual({ not_applicable_reason: null });

    // Both ends of BETWEEN 1 AND 200 are refused, so an empty string cannot
    // stand in for a reason.
    for (const reason of ['', 'a'.repeat(201)]) {
      const error = await refusal(
        state.sqlClient`UPDATE compliance_checklist_items SET not_applicable_reason = ${reason} WHERE id = ${itemId}`,
      );
      expect(error.code, `length ${reason.length}`).toBe('23514');
      expect(error.constraint_name, `length ${reason.length}`).toBe(
        'compliance_checklist_items_not_applicable_reason_len',
      );
    }

    for (const reason of ['a', 'a'.repeat(200)]) {
      await state.sqlClient`UPDATE compliance_checklist_items SET not_applicable_reason = ${reason} WHERE id = ${itemId}`;
    }
    await state.sqlClient`UPDATE compliance_checklist_items SET not_applicable_reason = NULL WHERE id = ${itemId}`;
  });

  it('adds auto_linked_document_id with a set-null foreign key to documents', async () => {
    const [column] = await state.sqlClient<
      { data_type: string; is_nullable: string; column_default: string | null }[]
    >`
      SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'compliance_checklist_items'
        AND column_name = 'auto_linked_document_id'
    `;
    expect(column).toEqual({ data_type: 'bigint', is_nullable: 'YES', column_default: null });

    // Found by the column it constrains, not by name (see the file header).
    const foreignKeys = await state.sqlClient<
      { references_documents: boolean; confdeltype: string }[]
    >`
      SELECT con.confrelid = 'public.documents'::regclass AS references_documents, con.confdeltype
      FROM pg_constraint con
      JOIN pg_attribute att
        ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
      WHERE con.contype = 'f'
        AND con.conrelid = 'public.compliance_checklist_items'::regclass
        AND att.attname = 'auto_linked_document_id'
    `;
    expect(foreignKeys).toEqual([{ references_documents: true, confdeltype: 'n' }]);

    // It really points at documents: an id that is not one is refused.
    const itemId = await insertChecklistItem();
    const dangling = await refusal(
      state.sqlClient`UPDATE compliance_checklist_items SET auto_linked_document_id = 2147483647 WHERE id = ${itemId}`,
    );
    expect(dangling.code).toBe('23503');
  });

  it('clears auto_linked_document_id and keeps the item when its document is deleted', async () => {
    const itemId = await insertChecklistItem();
    const documentId = await insertDocument();
    // What the auto-linker writes: one statement, both columns, same document.
    await state.sqlClient`
      UPDATE compliance_checklist_items
      SET document_id = ${documentId}, auto_linked_document_id = ${documentId}
      WHERE id = ${itemId}
    `;

    await state.sqlClient`DELETE FROM documents WHERE id = ${documentId}`;

    const items = await state.sqlClient`
      SELECT document_id, auto_linked_document_id FROM compliance_checklist_items WHERE id = ${itemId}
    `;
    expect(items).toEqual([{ document_id: null, auto_linked_document_id: null }]);
  });

  it('creates compliance_checklist_items_document_id_idx', async () => {
    const indexes = await state.sqlClient<{ indexdef: string }[]>`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'compliance_checklist_items'
        AND indexname = 'compliance_checklist_items_document_id_idx'
    `;
    expect(indexes).toHaveLength(1);

    // Split the key from the predicate and drop Postgres's parentheses, whose
    // placement differs between server versions.
    const [key, predicate] = indexes[0]!.indexdef.split(' WHERE ');
    expect(key).toMatch(/^CREATE INDEX .* USING btree \(document_id\)$/);
    expect(predicate?.replace(/[()]/g, '')).toBe('document_id IS NOT NULL AND deleted_at IS NULL');
  });
});
