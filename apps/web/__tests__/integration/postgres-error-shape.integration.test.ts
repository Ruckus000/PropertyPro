/**
 * The shape a unique violation actually takes when it reaches application code.
 *
 * This suite pins a DRIVER CONTRACT that no unit test can: drizzle-orm (0.45.x,
 * `pg-core/session.js` `queryWithCache`) wraps every failed query as
 * `new DrizzleQueryError(query, params, cause)`, so Postgres's
 * `code: '23505'` lives on `.cause` and the error the app catches has NO
 * top-level `code`. Any "is this a duplicate?" predicate that reads only the
 * top-level `code` is therefore dead on every drizzle path.
 *
 * That is not hypothetical: `isTopLevelUniqueConstraintError` (removed) and a
 * handful of hand-rolled copies read only `code`, and their unit tests fed a
 * hand-built top-level shape the driver never produces. If a drizzle upgrade
 * ever changes the wrapping, THIS file is what goes red.
 *
 * It also drives one real call site end to end: `createChecklistItems` is an
 * idempotent bootstrap whose second run must swallow its own duplicates.
 */
import { DrizzleQueryError } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { marketingLeads } from '@propertypro/db';
import { inArray } from '@propertypro/db/filters';
// AUTHZ: Integration test for the platform-level marketing_leads table; no community_id exists to scope by.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { isUniqueConstraintError, isNamedUniqueViolation } from '../../src/lib/db/postgres-error';
import { createChecklistItems } from '../../src/lib/services/onboarding-checklist-service';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  getDescribeDb,
  initTestKit,
  requireCommunity,
  requireDatabaseUrlInCI,
  requireUser,
  seedCommunities,
  seedUsers,
  teardownTestKit,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('postgres-error-shape');
const describeDb = getDescribeDb();

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const EMAIL = `dup-shape-${RUN}@leadtest.invalid`;

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the insert to be rejected');
}

describeDb('unique-violation error shape through drizzle (integration)', () => {
  const db = createUnscopedClient();
  let state: TestKitState | null = null;

  const cleanupLeads = () =>
    db.delete(marketingLeads).where(inArray(marketingLeads.emailNormalized, [EMAIL]));

  beforeAll(async () => {
    await cleanupLeads();
    state = await initTestKit();
    await seedCommunities(state, MULTI_TENANT_COMMUNITIES.filter((c) => c.key === 'communityA'));
    await seedUsers(state, MULTI_TENANT_USERS.filter((u) => u.key === 'actorA'));
  });

  afterAll(async () => {
    await cleanupLeads();
    if (state) await teardownTestKit(state);
  });

  it('wraps the Postgres error: no top-level code, 23505 and the constraint name on .cause', async () => {
    const row = { email: EMAIL, emailNormalized: EMAIL };
    await db.insert(marketingLeads).values(row);

    const error = await captureRejection(db.insert(marketingLeads).values(row));

    expect(error).toBeInstanceOf(DrizzleQueryError);
    expect((error as { code?: unknown }).code).toBeUndefined();
    const cause = (error as { cause?: { code?: unknown; constraint_name?: unknown } }).cause;
    expect(cause?.code).toBe('23505');
    expect(cause?.constraint_name).toBe('marketing_leads_email_normalized_key');

    expect(isUniqueConstraintError(error)).toBe(true);
    expect(isNamedUniqueViolation(error, 'marketing_leads_email_normalized_key')).toBe(true);
    expect(isNamedUniqueViolation(error, 'some_other_constraint')).toBe(false);
  });

  it('keeps the same shape inside a transaction (the elections/finance path)', async () => {
    const row = { email: EMAIL, emailNormalized: EMAIL };
    const error = await captureRejection(
      db.transaction(async (tx) => {
        await tx.insert(marketingLeads).values(row);
      }),
    );

    expect(error).toBeInstanceOf(DrizzleQueryError);
    expect((error as { code?: unknown }).code).toBeUndefined();
    expect(isUniqueConstraintError(error)).toBe(true);
  });

  it('lets an idempotent bootstrap run twice (createChecklistItems swallows its own duplicates)', async () => {
    const s = state!;
    const communityId = requireCommunity(s, 'communityA').id;
    const userId = requireUser(s, 'actorA').id;

    await createChecklistItems(communityId, userId, 'root_manager', null, 'condo_718');
    await expect(
      createChecklistItems(communityId, userId, 'root_manager', null, 'condo_718'),
    ).resolves.toBeUndefined();
  });
});
