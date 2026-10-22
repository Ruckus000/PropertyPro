/**
 * Setup-checklist integration test: retiring the apartment compliance step
 * (migration 0074) on real Postgres.
 *
 * This file also drove the 2-step apartment setup wizard's API until that
 * wizard was deleted: no route ever sent a founder to it (onboarding audit
 * F11). The checklist case below never depended on it and stays.
 */
import { readFileSync } from 'node:fs';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  apiUrl,
  initTestKit,
  parseJson,
  requireCommunity,
  seedCommunities,
  seedUsers,
  setActor,
  teardownTestKit,
} from './helpers/multi-tenant-test-kit';

if (process.env.CI && !process.env.DATABASE_URL) {
  throw new Error('Onboarding flow integration tests require DATABASE_URL in CI');
}

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

// No file-local mocks: setup-integration.ts's shared providers supply the
// session (keyed on the kit's current actor) and capture the outbound side
// effects (notification email queue, announcement fan-out, PDF extraction).
// Membership, permissions and tenant scoping are the real code.

type OnboardingChecklistRouteModule = typeof import('../../src/app/api/v1/onboarding/checklist/route');

interface RouteModules {
  checklist: OnboardingChecklistRouteModule;
}

const retireApartmentComplianceChecklistStep = readFileSync(
  new URL(
    '../../../../packages/db/migrations/0074_retire_apartment_compliance_checklist_step.sql',
    import.meta.url,
  ),
  'utf8',
);

let state: TestKitState | null = null;
let routes: RouteModules | null = null;

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function requireRoutes(): RouteModules {
  if (!routes) throw new Error('Routes not loaded');
  return routes;
}

describeDb('setup checklist: apartment compliance step retirement (db-backed)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    const communityA = MULTI_TENANT_COMMUNITIES.find((community) => community.key === 'communityA');
    const communityC = MULTI_TENANT_COMMUNITIES.find((community) => community.key === 'communityC');
    if (!communityA || !communityC) {
      throw new Error('Required community fixtures not found');
    }

    await seedCommunities(state, [communityA, communityC]);

    const siteManagerC = MULTI_TENANT_USERS.find((user) => user.key === 'siteManagerC');
    const actorA = MULTI_TENANT_USERS.find((user) => user.key === 'actorA');
    if (!siteManagerC || !actorA) {
      throw new Error('Required user fixtures not found');
    }

    await seedUsers(state, [siteManagerC, actorA]);

    routes = {
      checklist: await import('../../src/app/api/v1/onboarding/checklist/route'),
    };
  });

  beforeEach(() => {
    const kit = requireState();
    setActor(kit, 'siteManagerC');
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('retires only existing apartment compliance rows, remains idempotent, and hides them from reads', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityC = requireCommunity(kit, 'communityC');
    const actorA = kit.users.get('actorA');
    const siteManagerC = kit.users.get('siteManagerC');

    if (!actorA || !siteManagerC) throw new Error('Required checklist users not seeded');

    // Simulate the exact pre-remediation rows on both sides of the tenant-type
    // boundary. The local DB has already applied 0074 at setup, so executing
    // its data-only statement below against these rows tests both its effect
    // and the safe re-run behavior we need for deployment retries.
    await kit.db
      .delete(kit.dbModule.onboardingChecklistItems)
      .where(
        and(
          inArray(kit.dbModule.onboardingChecklistItems.communityId, [communityA.id, communityC.id]),
          inArray(kit.dbModule.onboardingChecklistItems.userId, [actorA.id, siteManagerC.id]),
          eq(kit.dbModule.onboardingChecklistItems.itemKey, 'review_compliance'),
        ),
      );

    const inserted = await kit.db
      .insert(kit.dbModule.onboardingChecklistItems)
      .values([
        { communityId: communityA.id, userId: actorA.id, itemKey: 'review_compliance' },
        { communityId: communityC.id, userId: siteManagerC.id, itemKey: 'review_compliance' },
      ])
      .returning({
        id: kit.dbModule.onboardingChecklistItems.id,
        communityId: kit.dbModule.onboardingChecklistItems.communityId,
      });

    await kit.db.execute(sql.raw(retireApartmentComplianceChecklistStep));

    const firstPass = await kit.db
      .select({
        id: kit.dbModule.onboardingChecklistItems.id,
        communityId: kit.dbModule.onboardingChecklistItems.communityId,
        deletedAt: kit.dbModule.onboardingChecklistItems.deletedAt,
      })
      .from(kit.dbModule.onboardingChecklistItems)
      .where(inArray(kit.dbModule.onboardingChecklistItems.id, inserted.map((row) => row.id)));

    const apartmentRow = firstPass.find((row) => row.communityId === communityC.id);
    const condoRow = firstPass.find((row) => row.communityId === communityA.id);
    expect(apartmentRow?.deletedAt).toBeInstanceOf(Date);
    expect(condoRow?.deletedAt).toBeNull();
    const retiredAt = apartmentRow?.deletedAt?.toISOString();

    await kit.db.execute(sql.raw(retireApartmentComplianceChecklistStep));

    const secondPass = await kit.db
      .select({
        communityId: kit.dbModule.onboardingChecklistItems.communityId,
        deletedAt: kit.dbModule.onboardingChecklistItems.deletedAt,
      })
      .from(kit.dbModule.onboardingChecklistItems)
      .where(inArray(kit.dbModule.onboardingChecklistItems.id, inserted.map((row) => row.id)));
    expect(secondPass.find((row) => row.communityId === communityC.id)?.deletedAt?.toISOString()).toBe(
      retiredAt,
    );

    setActor(kit, 'siteManagerC');
    const checklistResponse = await appRoutes.checklist.GET(
      new NextRequest(apiUrl('/api/v1/onboarding/checklist'), {
        headers: { 'x-community-id': String(communityC.id) },
      }),
    );
    expect(checklistResponse.status).toBe(200);
    const checklistJson = await parseJson<{ data: Array<{ itemKey: string }> }>(checklistResponse);
    expect(checklistJson.data.map((item) => item.itemKey)).not.toContain('review_compliance');
  });
});
