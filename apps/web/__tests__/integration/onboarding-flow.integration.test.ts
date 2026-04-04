/**
 * Onboarding flow integration test — P2-38 closeout
 */
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_APARTMENT_ITEMS } from '../../src/lib/services/onboarding-checklist-service';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  apiUrl,
  initTestKit,
  jsonRequest,
  parseJson,
  requireCommunity,
  requireCurrentActor,
  seedCommunities,
  seedUsers,
  setActor,
  teardownTestKit,
} from './helpers/multi-tenant-test-kit';

if (process.env.CI && !process.env.DATABASE_URL) {
  throw new Error('Onboarding flow integration tests require DATABASE_URL in CI');
}

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const { requireAuthenticatedUserIdMock } = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

type OnboardingRouteModule = typeof import('../../src/app/api/v1/onboarding/apartment/route');

interface RouteModules {
  onboarding: OnboardingRouteModule;
}

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

async function clearOnboardingArtifacts(
  kit: TestKitState,
  communityId: number,
  userId: string,
): Promise<void> {
  const scoped = kit.dbModule.createScopedClient(communityId);
  await scoped.hardDelete(
    kit.dbModule.onboardingWizardState,
    eq(kit.dbModule.onboardingWizardState.wizardType, 'apartment'),
  );
  await scoped.hardDelete(
    kit.dbModule.onboardingChecklistItems,
    eq(kit.dbModule.onboardingChecklistItems.userId, userId),
  );
}

describeDb('onboarding flow (db-backed integration)', () => {
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
      onboarding: await import('../../src/app/api/v1/onboarding/apartment/route'),
    };
  });

  beforeEach(() => {
    vi.clearAllMocks();
    const kit = requireState();
    requireAuthenticatedUserIdMock.mockImplementation(async () => requireCurrentActor(kit));
    setActor(kit, 'siteManagerC');
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('GET initializes, PATCH saves profile, and POST completes the 2-step flow', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');
    const siteManagerC = kit.users.get('siteManagerC');

    if (!siteManagerC) throw new Error('siteManagerC not seeded');

    await clearOnboardingArtifacts(kit, communityC.id, siteManagerC.id);

    const getResponse = await appRoutes.onboarding.GET(
      new NextRequest(apiUrl(`/api/v1/onboarding/apartment?communityId=${communityC.id}`)),
    );
    expect(getResponse.status).toBe(200);
    const getJson = await parseJson<{
      data: {
        status: string;
        lastCompletedStep: number | null;
        nextStep: number;
        stepData: {
          profile?: {
            name?: string;
            timezone?: string;
          };
        };
      };
    }>(getResponse);

    expect(getJson.data.status).toBe('in_progress');
    expect(getJson.data.lastCompletedStep).toBeNull();
    expect(getJson.data.nextStep).toBe(0);
    expect(getJson.data.stepData.profile?.name).toBe(`${communityC.fixture.name} ${kit.runSuffix}`);
    expect(getJson.data.stepData.profile?.timezone).toBe(communityC.fixture.timezone);

    const profileData = {
      name: `Apartment Wizard ${kit.runSuffix}`,
      addressLine1: '500 Harbor Drive',
      addressLine2: null,
      city: 'Miami',
      state: 'FL',
      zipCode: '33131',
      timezone: 'America/New_York',
      logoPath: null,
    };

    const patchResponse = await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        step: 0,
        stepData: { profile: profileData },
      }),
    );
    expect(patchResponse.status).toBe(200);
    const patchJson = await parseJson<{
      data: {
        lastCompletedStep: number;
        nextStep: number;
        status: string;
        stepData: {
          profile?: {
            name?: string;
          };
        };
      };
    }>(patchResponse);

    expect(patchJson.data.status).toBe('in_progress');
    expect(patchJson.data.lastCompletedStep).toBe(0);
    expect(patchJson.data.nextStep).toBe(1);
    expect(patchJson.data.stepData.profile?.name).toBe(profileData.name);

    const scoped = kit.dbModule.createScopedClient(communityC.id);
    const communityRows = await scoped.query(kit.dbModule.communities);
    const updatedCommunity = communityRows.find((row) => row['id'] === communityC.id);
    expect(updatedCommunity?.['name']).toBe(profileData.name);
    expect(updatedCommunity?.['addressLine1']).toBe(profileData.addressLine1);
    expect(updatedCommunity?.['city']).toBe(profileData.city);
    expect(updatedCommunity?.['timezone']).toBe(profileData.timezone);

    const resumeResponse = await appRoutes.onboarding.GET(
      new NextRequest(apiUrl(`/api/v1/onboarding/apartment?communityId=${communityC.id}`)),
    );
    expect(resumeResponse.status).toBe(200);
    const resumeJson = await parseJson<{
      data: {
        lastCompletedStep: number | null;
        nextStep: number;
        stepData: {
          profile?: {
            name?: string;
          };
        };
      };
    }>(resumeResponse);

    expect(resumeJson.data.lastCompletedStep).toBe(0);
    expect(resumeJson.data.nextStep).toBe(1);
    expect(resumeJson.data.stepData.profile?.name).toBe(profileData.name);

    const completeResponse = await appRoutes.onboarding.POST(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'POST', {
        communityId: communityC.id,
        action: 'complete',
      }),
    );
    expect(completeResponse.status).toBe(201);
    const completeJson = await parseJson<{
      data: {
        status: string;
        completedAt: string | null;
      };
    }>(completeResponse);

    expect(completeJson.data.status).toBe('completed');
    expect(completeJson.data.completedAt).toBeTruthy();

    const secondCompleteResponse = await appRoutes.onboarding.POST(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'POST', {
        communityId: communityC.id,
        action: 'complete',
      }),
    );
    expect(secondCompleteResponse.status).toBe(200);
    const secondCompleteJson = await parseJson<{
      data: {
        status: string;
        noop?: boolean;
      };
    }>(secondCompleteResponse);

    expect(secondCompleteJson.data.status).toBe('completed');
    expect(secondCompleteJson.data.noop).toBe(true);

    const wizardRows = await scoped.query(kit.dbModule.onboardingWizardState);
    const wizard = wizardRows.find((row) => row['wizardType'] === 'apartment');
    expect(wizard?.['status']).toBe('completed');
    expect(wizard?.['lastCompletedStep']).toBe(1);

    const checklistRows = await scoped.query(kit.dbModule.onboardingChecklistItems);
    const actorChecklist = checklistRows.filter((row) => row['userId'] === siteManagerC.id);
    expect(actorChecklist.map((row) => String(row['itemKey'])).sort()).toEqual(
      [...ADMIN_APARTMENT_ITEMS].sort(),
    );
    expect(actorChecklist.every((row) => row['completedAt'] == null)).toBe(true);
  });

  it('feature gate: condo community returns 403 on GET', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'actorA');

    const response = await appRoutes.onboarding.GET(
      new NextRequest(apiUrl(`/api/v1/onboarding/apartment?communityId=${communityA.id}`)),
    );

    expect(response.status).toBe(403);
  });

  it('subscription guard: locked community returns 403 on PATCH', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');

    await kit.db
      .update(kit.dbModule.communities)
      .set({ subscriptionStatus: 'canceled' })
      .where(eq(kit.dbModule.communities.id, communityC.id));

    const response = await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        step: 0,
        stepData: {
          profile: {
            name: 'Locked Community',
            addressLine1: '123 Main St',
            city: 'Miami',
            state: 'FL',
            zipCode: '33101',
            timezone: 'America/New_York',
          },
        },
      }),
    );

    expect(response.status).toBe(403);

    await kit.db
      .update(kit.dbModule.communities)
      .set({ subscriptionStatus: null })
      .where(eq(kit.dbModule.communities.id, communityC.id));
  });

  it('rejects step 0 PATCH requests without profile data', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');
    const siteManagerC = kit.users.get('siteManagerC');

    if (!siteManagerC) throw new Error('siteManagerC not seeded');

    await clearOnboardingArtifacts(kit, communityC.id, siteManagerC.id);

    const response = await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        step: 0,
        stepData: {},
      }),
    );

    expect(response.status).toBe(400);
    const json = await parseJson<{ error?: { message?: string } }>(response);
    expect(json.error?.message ?? '').toContain('stepData.profile is required for step 0');
  });

  it('concurrent GET initialization creates only one wizard row', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');
    const siteManagerC = kit.users.get('siteManagerC');

    if (!siteManagerC) throw new Error('siteManagerC not seeded');

    await clearOnboardingArtifacts(kit, communityC.id, siteManagerC.id);

    const [responseA, responseB] = await Promise.all([
      appRoutes.onboarding.GET(
        new NextRequest(apiUrl(`/api/v1/onboarding/apartment?communityId=${communityC.id}`)),
      ),
      appRoutes.onboarding.GET(
        new NextRequest(apiUrl(`/api/v1/onboarding/apartment?communityId=${communityC.id}`)),
      ),
    ]);

    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);

    const scoped = kit.dbModule.createScopedClient(communityC.id);
    const rows = await scoped.query(kit.dbModule.onboardingWizardState);
    const wizardRows = rows.filter((row) => row['wizardType'] === 'apartment');
    expect(wizardRows).toHaveLength(1);
  });
});
