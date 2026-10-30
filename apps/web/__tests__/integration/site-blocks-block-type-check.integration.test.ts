/**
 * `site_blocks_block_type_check` — the CHECK constraint that gates block types.
 *
 * The block type list is a CHECK constraint, not an enum, and it is duplicated
 * (without a compile-time link) across the constraint, `BLOCK_TYPES`, and the
 * upsert contract's z.enum. Nothing in the unit suite can catch the constraint
 * half being missed: the schemas accept `payments`, the contract accepts it,
 * the renderer renders it, and then every INSERT fails in production.
 *
 * So this runs against a real Postgres, and asserts BOTH directions — that
 * migration 0044 admits `payments`, and that widening it did not turn the
 * constraint into a rubber stamp.
 *
 * Migration 0096 widens it again, for `quicklinks` and `board`. That one is the
 * database half of a two-release rollout: the first release lets the database and
 * the renderers accept the two types, and the second is the first to write one.
 * They are asserted by name, so a failure points at that migration and not at the
 * shared `BLOCK_TYPES` union.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { BLOCK_TYPES, TOMBSTONE_BLOCK_TYPE } from '@propertypro/shared';
import {
  type TestKitState,
  initTestKit,
  seedCommunities,
  seedUsers,
  teardownTestKit,
  requireCommunity,
  requireDatabaseUrlInCI,
  getDescribeDb,
} from './helpers/multi-tenant-test-kit';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS } from '../fixtures/multi-tenant-users';

requireDatabaseUrlInCI('site_blocks block_type CHECK integration tests');

const describeDb = getDescribeDb();

let state: TestKitState;

beforeAll(async () => {
  state = await initTestKit();
  await seedCommunities(state, MULTI_TENANT_COMMUNITIES);
  await seedUsers(state, MULTI_TENANT_USERS);
});

afterAll(async () => {
  await teardownTestKit(state);
});

/**
 * Insert straight through the unscoped client with raw SQL.
 *
 * Deliberately NOT through `upsertPublishedBlock`: the service applies its own
 * validation, so a passing insert there would prove the service accepted the
 * type, not that the DATABASE did. The constraint is the thing under test.
 */
async function insertBlockType(communityId: number, blockType: string): Promise<void> {
  // `page_id` is NOT NULL as of 0048, so even a raw insert has to name a page.
  // Created inline rather than via `ensureHomePage` for the same reason the
  // insert is raw: this file tests the DATABASE constraint, and routing through
  // a service would prove the service accepted the type instead.
  const [page] = await state.db.execute<{ id: number }>(sql`
    INSERT INTO site_pages (community_id, name, slug, in_nav, sort_order, is_home, is_draft)
    VALUES (${communityId}, 'Home', '', true, 0, true, true)
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
  const pageId =
    page?.id ??
    (
      await state.db.execute<{ id: number }>(sql`
        SELECT id FROM site_pages
        WHERE community_id = ${communityId} AND is_home AND deleted_at IS NULL
      `)
    )[0]!.id;

  await state.db.execute(sql`
    INSERT INTO site_blocks (community_id, page_id, block_type, block_order, content, is_draft)
    VALUES (${communityId}, ${pageId}, ${blockType}, ${90}, ${'{}'}::jsonb, ${true})
  `);
  await state.db.execute(sql`
    DELETE FROM site_blocks WHERE community_id = ${communityId} AND block_order = 90
  `);
}

/** The slice of a postgres.js `PostgresError` the rejection assertion reads. */
interface PgError {
  code?: string;
  constraint_name?: string;
  cause?: PgError;
}

/**
 * Insert a block of this type and hand back the error the database raised.
 *
 * Throws if the insert SUCCEEDED, so "it was accepted" fails loudly instead of
 * passing as an empty catch. drizzle wraps a driver error in a
 * `DrizzleQueryError` whose `cause` is the `PostgresError`, so this reads
 * through the wrapper to the fields the server set.
 */
async function refusedBlockType(communityId: number, blockType: string): Promise<PgError> {
  try {
    await insertBlockType(communityId, blockType);
  } catch (error) {
    const raised = error as PgError;
    return raised.cause ?? raised;
  }
  throw new Error(`expected "${blockType}" to be refused by the CHECK constraint, but it was accepted`);
}

describeDb('site_blocks_block_type_check', () => {
  it('accepts the payments block type (migration 0044)', async () => {
    const community = requireCommunity(state, 'communityA');
    await expect(insertBlockType(community.id, 'payments')).resolves.toBeUndefined();
  });

  it('accepts quicklinks and board block types', async () => {
    // Migration 0096, the read release: the database admits both before any
    // code writes one. Named here, not taken from BLOCK_TYPES, so a failure
    // points at the migration.
    const community = requireCommunity(state, 'communityA');
    for (const blockType of ['quicklinks', 'board']) {
      // Not `.resolves`: its failure text drops the assertion message, so it
      // would not say WHICH of the two types the constraint refused.
      await insertBlockType(community.id, blockType).catch((error: unknown) => {
        throw new Error(`"${blockType}" is not in the CHECK constraint (migration 0096)`, {
          cause: error,
        });
      });
    }
  });

  it('accepts every type in the shared BLOCK_TYPES union', async () => {
    // The constraint and BLOCK_TYPES are hand-maintained duplicates. This is
    // the only place they are compared.
    const community = requireCommunity(state, 'communityA');
    for (const blockType of BLOCK_TYPES) {
      await expect(
        insertBlockType(community.id, blockType),
        `BLOCK_TYPES contains "${blockType}" but the CHECK constraint rejects it`,
      ).resolves.toBeUndefined();
    }
  });

  it('still accepts the tombstone sentinel, which is not in BLOCK_TYPES', async () => {
    const community = requireCommunity(state, 'communityA');
    await expect(
      insertBlockType(community.id, TOMBSTONE_BLOCK_TYPE),
    ).resolves.toBeUndefined();
  });

  it('still rejects an unknown type', async () => {
    // Widening a CHECK by two names must not admit their neighbours. These are
    // the near-misses a hurried writer is likeliest to produce for the NEW
    // types, and each must be refused for the claimed reason: SQLSTATE 23514
    // naming this constraint, not a failed page insert or a dropped connection.
    const community = requireCommunity(state, 'communityA');
    for (const blockType of [
      'quicklink',
      'quick_links',
      'QUICKLINKS',
      'boards',
      'Board',
      'board_members',
    ]) {
      const refusal = await refusedBlockType(community.id, blockType);
      expect(
        { code: refusal.code, constraint: refusal.constraint_name },
        `"${blockType}" must be refused by site_blocks_block_type_check`,
      ).toEqual({ code: '23514', constraint: 'site_blocks_block_type_check' });
    }
  });

  it.each([
    ['jsx_template', 'a retired type (migration 0008)'],
    ['payment', 'a near-miss singular'],
    ['PAYMENTS', 'wrong case — the constraint is case-sensitive'],
    ['', 'empty'],
    ['not_a_block_type', 'nonsense'],
    ["payments'); DROP TABLE site_blocks;--", 'an injection-shaped string'],
  ])('still rejects %s (%s)', async (blockType) => {
    // Widening a CHECK must not turn it into a rubber stamp.
    const community = requireCommunity(state, 'communityA');
    await expect(insertBlockType(community.id, blockType)).rejects.toThrow();
  });
});
