/**
 * Onboarding flow integration test — P2-38 closeout
 */
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  initTestKit,
  seedCommunities,
  seedUsers,
  teardownTestKit,
  trackUserForCleanup,
  requireCommunity,
  setActor,
  requireCurrentActor,
  apiUrl,
  jsonRequest,
  parseJson,
} from './helpers/multi-tenant-test-kit';

if (process.env.CI && !process.env.DATABASE_URL) {
  throw new Error('Onboarding flow integration tests require DATABASE_URL in CI');
}

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const { requireAuthenticatedUserIdMock, sendEmailMock } = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  sendEmailMock: vi.fn().mockResolvedValue({ id: 'mock-email-id' }),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@propertypro/email', () => ({
  sendEmail: sendEmailMock,
  InvitationEmail: vi.fn(),
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

async function clearWizardState(kit: TestKitState, communityId: number): Promise<void> {
  const scoped = kit.dbModule.createScopedClient(communityId);
  await scoped.hardDelete(
    kit.dbModule.onboardingWizardState,
    eq(kit.dbModule.onboardingWizardState.wizardType, 'apartment'),
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

  it('step progression persists and completion creates units/resident/invitation', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');

    await clearWizardState(kit, communityC.id);

    const profileData = {
      name: `Wizard Progression ${kit.runSuffix}`,
      addressLine1: '123 Main Street',
      addressLine2: null,
      city: 'Miami',
      state: 'FL',
      zipCode: '33101',
      timezone: 'America/New_York',
      logoPath: null,
    };

    const unitsData = [
      {
        unitNumber: `P2-38-A101-${kit.runSuffix}`,
        floor: 1,
        bedrooms: 2,
        bathrooms: 1,
        sqft: 850,
        rentAmount: '1400.00',
      },
      {
        unitNumber: `P2-38-A102-${kit.runSuffix}`,
        floor: 1,
        bedrooms: 1,
        bathrooms: 1,
        sqft: 650,
        rentAmount: '1200.00',
      },
    ];

    const rulesData = {
      documentId: 12345,
      path: `documents/rules-${kit.runSuffix}.pdf`,
    };

    const inviteData = {
      email: `p238.flow+${kit.runSuffix}@example.com`,
      fullName: `P2-38 Flow Resident ${kit.runSuffix}`,
      unitNumber: unitsData[0].unitNumber,
    };

    const getResponse = await appRoutes.onboarding.GET(
      new NextRequest(apiUrl(`/api/v1/onboarding/apartment?communityId=${communityC.id}`)),
    );
    expect(getResponse.status).toBe(200);
    const getJson = await parseJson<{
      data: {
        status: string;
        lastCompletedStep: number | null;
        nextStep: number;
      };
    }>(getResponse);
    expect(getJson.data.status).toBe('in_progress');
    expect(getJson.data.lastCompletedStep).toBeNull();
    expect(getJson.data.nextStep).toBe(0);

    const patchStep0 = await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        step: 0,
        stepData: { profile: profileData },
      }),
    );
    expect(patchStep0.status).toBe(200);

    const patchBranding = await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        step: 1,
        stepData: { branding: { primaryColor: '#3B82F6', secondaryColor: '#6B7280', accentColor: '#BFDBFE', fontHeading: 'Inter', fontBody: 'Inter' } },
      }),
    );
    expect(patchBranding.status).toBe(200);

    const patchStep2 = await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        step: 2,
        stepData: { units: unitsData },
      }),
    );
    expect(patchStep2.status).toBe(200);

    const patchStep3 = await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        step: 3,
        stepData: { rules: rulesData },
      }),
    );
    expect(patchStep3.status).toBe(200);

    const resumeGet = await appRoutes.onboarding.GET(
      new NextRequest(apiUrl(`/api/v1/onboarding/apartment?communityId=${communityC.id}`)),
    );
    expect(resumeGet.status).toBe(200);
    const resumeJson = await parseJson<{
      data: {
        lastCompletedStep: number | null;
        nextStep: number;
        stepData: {
          profile?: Record<string, unknown>;
          units?: Array<Record<string, unknown>>;
          rules?: Record<string, unknown> | null;
        };
      };
    }>(resumeGet);

    expect(resumeJson.data.lastCompletedStep).toBe(3);
    expect(resumeJson.data.nextStep).toBe(4);
    expect(resumeJson.data.stepData.profile?.name).toBe(profileData.name);
    expect(resumeJson.data.stepData.units).toHaveLength(2);
    expect(resumeJson.data.stepData.rules).toEqual(rulesData);

    const patchStep4 = await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        step: 4,
        stepData: { invite: inviteData },
      }),
    );
    expect(patchStep4.status).toBe(200);

    const complete = await appRoutes.onboarding.POST(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'POST', {
        communityId: communityC.id,
        action: 'complete',
      }),
    );
    expect(complete.status).toBe(201);

    const scoped = kit.dbModule.createScopedClient(communityC.id);
    const unitRows = await scoped.query(kit.dbModule.units);
    const createdUnits = unitRows.filter((row) =>
      unitsData.some((unit) => unit.unitNumber === row['unitNumber']),
    );
    expect(createdUnits).toHaveLength(2);

    const allUsers = await scoped.query(kit.dbModule.users);
    const residentUser = allUsers.find(
      (row) => ((row['email'] as string) ?? '').toLowerCase() === inviteData.email.toLowerCase(),
    );
    expect(residentUser).toBeDefined();

    if (residentUser) {
      trackUserForCleanup(kit, residentUser['id'] as string);
    }

    const invitations = await scoped.query(kit.dbModule.invitations);
    const invitation = invitations.find((row) => row['userId'] === residentUser?.['id']);
    expect(invitation).toBeDefined();

    const wizardRows = await scoped.query(kit.dbModule.onboardingWizardState);
    const wizard = wizardRows.find((row) => row['wizardType'] === 'apartment');
    expect(wizard?.['status']).toBe('completed');
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

  it('first-visit skip succeeds without prior GET and creates skipped state', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');

    await clearWizardState(kit, communityC.id);

    const scoped = kit.dbModule.createScopedClient(communityC.id);
    const unitsBefore = await scoped.query(kit.dbModule.units);

    const response = await appRoutes.onboarding.POST(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'POST', {
        communityId: communityC.id,
        action: 'skip',
      }),
    );

    expect(response.status).toBe(200);
    const json = await parseJson<{ data: { status: string } }>(response);
    expect(json.data.status).toBe('skipped');

    const wizardRows = await scoped.query(kit.dbModule.onboardingWizardState);
    const wizard = wizardRows.find((row) => row['wizardType'] === 'apartment');
    expect(wizard).toBeDefined();
    expect(wizard?.['status']).toBe('skipped');

    const unitsAfter = await scoped.query(kit.dbModule.units);
    expect(unitsAfter.length).toBe(unitsBefore.length);
  });

  it('idempotent complete does not create duplicates', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');

    await clearWizardState(kit, communityC.id);

    const unitsData = [
      {
        unitNumber: `IDEMP-101-${kit.runSuffix}`,
        floor: 1,
        bedrooms: 2,
        bathrooms: 1,
        sqft: 900,
        rentAmount: '1500.00',
      },
    ];

    const inviteData = {
      email: `p238.idempotent+${kit.runSuffix}@example.com`,
      fullName: `P2-38 Idempotent ${kit.runSuffix}`,
      unitNumber: unitsData[0].unitNumber,
    };

    const profileData = {
      name: `Idempotent Profile ${kit.runSuffix}`,
      addressLine1: '100 Stable Dr',
      city: 'Orlando',
      state: 'FL',
      zipCode: '32801',
      timezone: 'America/New_York',
    };

    await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        step: 0,
        stepData: { profile: profileData },
      }),
    );
    await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        step: 1,
        stepData: { branding: { primaryColor: '#3B82F6', secondaryColor: '#6B7280', accentColor: '#BFDBFE', fontHeading: 'Inter', fontBody: 'Inter' } },
      }),
    );
    await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        step: 2,
        stepData: { units: unitsData },
      }),
    );
    await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        step: 3,
        stepData: { rules: null },
      }),
    );
    await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        step: 4,
        stepData: { invite: inviteData },
      }),
    );

    const first = await appRoutes.onboarding.POST(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'POST', {
        communityId: communityC.id,
        action: 'complete',
      }),
    );
    expect(first.status).toBe(201);

    const second = await appRoutes.onboarding.POST(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'POST', {
        communityId: communityC.id,
        action: 'complete',
      }),
    );
    expect(second.status).toBe(200);

    const scoped = kit.dbModule.createScopedClient(communityC.id);

    const createdUnits = (await scoped.query(kit.dbModule.units)).filter(
      (row) => row['unitNumber'] === unitsData[0].unitNumber,
    );
    expect(createdUnits).toHaveLength(1);

    const createdUsers = (await scoped.query(kit.dbModule.users)).filter(
      (row) => ((row['email'] as string) ?? '').toLowerCase() === inviteData.email.toLowerCase(),
    );
    expect(createdUsers).toHaveLength(1);

    if (createdUsers[0]) {
      trackUserForCleanup(kit, createdUsers[0]['id'] as string);
    }

    const createdInvitations = (await scoped.query(kit.dbModule.invitations)).filter(
      (row) => row['userId'] === createdUsers[0]?.['id'],
    );
    expect(createdInvitations).toHaveLength(1);
  });

  it('concurrent GET initialization creates only one wizard row', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');

    await clearWizardState(kit, communityC.id);

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
