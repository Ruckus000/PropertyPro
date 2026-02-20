/**
 * Onboarding flow integration test — P2-38
 *
 * Tests the complete end-to-end onboarding wizard flow:
 * 1. Site manager logs in to new apartment community
 * 2. Gets redirected to onboarding wizard
 * 3. Completes all 4 steps: Profile, Units, Rules, Invite
 * 4. Wizard completion creates units, resident, invitation
 * 5. Redirects to apartment dashboard
 * 6. Dashboard shows metrics with new data
 */
import { randomUUID } from 'node:crypto';
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
  requireUser,
  setActor,
  requireCurrentActor,
  apiUrl,
  jsonRequest,
  parseJson,
  readNumberField,
  requireInsertedRow,
} from './helpers/multi-tenant-test-kit';

if (process.env.CI && !process.env.DATABASE_URL) {
  throw new Error('Onboarding flow integration tests require DATABASE_URL in CI');
}

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Route types
// ---------------------------------------------------------------------------

type DbModule = typeof import('@propertypro/db');
type OnboardingRouteModule = typeof import('../../src/app/api/v1/onboarding/apartment/route');

interface RouteModules {
  onboarding: OnboardingRouteModule;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describeDb('onboarding flow (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    // Seed community C (apartment) for onboarding tests
    const communityC = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityC');
    if (!communityC) throw new Error('CommunityC fixture not found');
    await seedCommunities(state, [communityC]);

    // Seed siteManagerC for onboarding wizard
    const siteManagerCUser = MULTI_TENANT_USERS.find((u) => u.key === 'siteManagerC');
    if (!siteManagerCUser) throw new Error('siteManagerC fixture not found');
    await seedUsers(state, [siteManagerCUser]);

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

  // =========================================================================
  // GET — Initialize wizard state
  // =========================================================================

  it('GET: first visit creates wizard state with status in_progress', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');

    const response = await appRoutes.onboarding.GET(
      new NextRequest(apiUrl(`/api/v1/onboarding/apartment?communityId=${communityC.id}`)),
    );

    expect(response.status).toBe(200);
    const json = await parseJson<{
      data: {
        wizardType: string;
        status: string;
        currentStep: number;
        stepData: Record<string, unknown>;
        completedAt: string | null;
      };
    }>(response);

    expect(json.data.wizardType).toBe('apartment');
    expect(json.data.status).toBe('in_progress');
    expect(json.data.currentStep).toBe(0);
    expect(json.data.stepData).toEqual({});
    expect(json.data.completedAt).toBeNull();

    // Verify wizard state was created in DB
    const scoped = kit.dbModule.createScopedClient(communityC.id);
    const wizardRows = await scoped.query(kit.dbModule.onboardingWizardState);
    const wizard = wizardRows.find(
      (row) =>
        row['communityId'] === communityC.id &&
        row['wizardType'] === 'apartment',
    );

    expect(wizard).toBeDefined();
    expect(wizard?.['status']).toBe('in_progress');
  });

  it('GET: subsequent visits return existing wizard state', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');

    // First GET
    const response1 = await appRoutes.onboarding.GET(
      new NextRequest(apiUrl(`/api/v1/onboarding/apartment?communityId=${communityC.id}`)),
    );
    expect(response1.status).toBe(200);

    // Second GET (should return same state)
    const response2 = await appRoutes.onboarding.GET(
      new NextRequest(apiUrl(`/api/v1/onboarding/apartment?communityId=${communityC.id}`)),
    );
    expect(response2.status).toBe(200);

    const json1 = await parseJson<{ data: { currentStep: number } }>(response1);
    const json2 = await parseJson<{ data: { currentStep: number } }>(response2);

    expect(json1.data.currentStep).toBe(json2.data.currentStep);

    // Verify only one wizard state exists in DB
    const scoped = kit.dbModule.createScopedClient(communityC.id);
    const wizardRows = await scoped.query(kit.dbModule.onboardingWizardState);
    const wizards = wizardRows.filter(
      (row) =>
        row['communityId'] === communityC.id &&
        row['wizardType'] === 'apartment',
    );

    expect(wizards).toHaveLength(1);
  });

  // =========================================================================
  // PATCH — Save step data
  // =========================================================================

  it('PATCH step 1: saves profile data correctly', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');

    const profileData = {
      name: `Onboarding Test Community ${kit.runSuffix}`,
      addressLine1: '123 Main Street',
      addressLine2: 'Suite 100',
      city: 'Miami',
      state: 'FL',
      zipCode: '33101',
      timezone: 'America/New_York',
      logoPath: null,
    };

    const response = await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        currentStep: 1,
        stepData: {
          profile: profileData,
        },
      }),
    );

    expect(response.status).toBe(200);
    const json = await parseJson<{ data: { success: boolean; currentStep: number } }>(response);
    expect(json.data.success).toBe(true);
    expect(json.data.currentStep).toBe(1);

    // Verify DB update
    const scoped = kit.dbModule.createScopedClient(communityC.id);
    const wizardRows = await scoped.query(kit.dbModule.onboardingWizardState);
    const wizard = wizardRows.find(
      (row) =>
        row['communityId'] === communityC.id &&
        row['wizardType'] === 'apartment',
    );

    expect(wizard?.['lastCompletedStep']).toBe(1);
    const stepData = wizard?.['stepData'] as Record<string, unknown>;
    expect(stepData.profile).toEqual(profileData);
  });

  it('PATCH step 2: saves units data correctly', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');

    const unitsData = [
      {
        unitNumber: `A101-${kit.runSuffix}`,
        floor: 1,
        bedrooms: 2,
        bathrooms: 2,
        sqft: 950,
        rentAmount: '1500.00',
      },
      {
        unitNumber: `A102-${kit.runSuffix}`,
        floor: 1,
        bedrooms: 1,
        bathrooms: 1,
        sqft: 650,
        rentAmount: '1200.00',
      },
      {
        unitNumber: `B201-${kit.runSuffix}`,
        floor: 2,
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1200,
        rentAmount: '1800.00',
      },
    ];

    const response = await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        currentStep: 2,
        stepData: {
          unitsTable: unitsData,
        },
      }),
    );

    expect(response.status).toBe(200);

    // Verify DB update
    const scoped = kit.dbModule.createScopedClient(communityC.id);
    const wizardRows = await scoped.query(kit.dbModule.onboardingWizardState);
    const wizard = wizardRows.find(
      (row) =>
        row['communityId'] === communityC.id &&
        row['wizardType'] === 'apartment',
    );

    expect(wizard?.['lastCompletedStep']).toBe(2);
    const stepData = wizard?.['stepData'] as Record<string, unknown>;
    expect(stepData.unitsTable).toEqual(unitsData);
  });

  it('PATCH step 3: saves rules document reference', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');
    const siteManagerC = requireUser(kit, 'siteManagerC');
    const scoped = kit.dbModule.createScopedClient(communityC.id);

    // Create a document first
    const [docRow] = await scoped.insert(kit.dbModule.documents, {
      title: `Rules Document ${kit.runSuffix}`,
      filePath: `communities/${communityC.id}/documents/rules-${kit.runSuffix}.pdf`,
      fileName: `rules-${kit.runSuffix}.pdf`,
      fileSize: 2048,
      mimeType: 'application/pdf',
      uploadedBy: siteManagerC.id,
    });
    const documentId = readNumberField(requireInsertedRow(docRow, 'rulesDoc'), 'id');

    const rulesData = {
      documentId,
      path: `communities/${communityC.id}/documents/rules-${kit.runSuffix}.pdf`,
    };

    const response = await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        currentStep: 3,
        stepData: {
          rulesDoc: rulesData,
        },
      }),
    );

    expect(response.status).toBe(200);

    // Verify DB update
    const wizardRows = await scoped.query(kit.dbModule.onboardingWizardState);
    const wizard = wizardRows.find(
      (row) =>
        row['communityId'] === communityC.id &&
        row['wizardType'] === 'apartment',
    );

    expect(wizard?.['lastCompletedStep']).toBe(3);
    const stepData = wizard?.['stepData'] as Record<string, unknown>;
    expect(stepData.rulesDoc).toEqual(rulesData);
  });

  it('PATCH step 4: saves invite email data', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');

    const inviteData = {
      email: `first.resident+${kit.runSuffix}@example.com`,
      fullName: `First Resident ${kit.runSuffix}`,
      unitNumber: `A101-${kit.runSuffix}`,
    };

    const response = await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        currentStep: 4,
        stepData: {
          inviteEmail: inviteData,
        },
      }),
    );

    expect(response.status).toBe(200);

    // Verify DB update
    const scoped = kit.dbModule.createScopedClient(communityC.id);
    const wizardRows = await scoped.query(kit.dbModule.onboardingWizardState);
    const wizard = wizardRows.find(
      (row) =>
        row['communityId'] === communityC.id &&
        row['wizardType'] === 'apartment',
    );

    expect(wizard?.['lastCompletedStep']).toBe(4);
    const stepData = wizard?.['stepData'] as Record<string, unknown>;
    expect(stepData.inviteEmail).toEqual(inviteData);
  });

  it('PATCH: non-site_manager/property_manager_admin gets 403', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');

    // Seed a regular tenant
    const tenantUser = MULTI_TENANT_USERS.find((u) => u.key === 'tenantC');
    if (!tenantUser) throw new Error('tenantC fixture not found');

    // Check if tenant already seeded
    const existingTenant = kit.users.get('tenantC');
    if (!existingTenant) {
      await seedUsers(kit, [tenantUser]);
    }

    setActor(kit, 'tenantC');

    const response = await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        currentStep: 1,
        stepData: {
          profile: {
            name: 'Unauthorized',
            addressLine1: '123 Test St',
            city: 'Test',
            state: 'FL',
            zipCode: '33101',
            timezone: 'America/New_York',
          },
        },
      }),
    );

    expect(response.status).toBe(403);
  });

  // =========================================================================
  // POST — Complete wizard
  // =========================================================================

  it('POST: completes wizard and creates all resources', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');
    const scoped = kit.dbModule.createScopedClient(communityC.id);

    // Setup complete wizard state
    const profileData = {
      name: `Complete Test Community ${kit.runSuffix}`,
      addressLine1: '456 Oak Avenue',
      city: 'Tampa',
      state: 'FL',
      zipCode: '33602',
      timezone: 'America/New_York',
    };

    const unitsData = [
      {
        unitNumber: `X101-${kit.runSuffix}`,
        floor: 1,
        bedrooms: 2,
        bathrooms: 1,
        sqft: 850,
        rentAmount: '1400.00',
      },
      {
        unitNumber: `X102-${kit.runSuffix}`,
        floor: 1,
        bedrooms: 2,
        bathrooms: 1,
        sqft: 850,
        rentAmount: '1400.00',
      },
      {
        unitNumber: `X201-${kit.runSuffix}`,
        floor: 2,
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1100,
        rentAmount: '1700.00',
      },
    ];

    const inviteData = {
      email: `complete.resident+${kit.runSuffix}@example.com`,
      fullName: `Complete Resident ${kit.runSuffix}`,
      unitNumber: `X101-${kit.runSuffix}`,
    };

    // Update wizard with all step data
    await scoped.update(
      kit.dbModule.onboardingWizardState,
      {
        lastCompletedStep: 4,
        stepData: {
          profile: profileData,
          unitsTable: unitsData,
          rulesDoc: null,
          inviteEmail: inviteData,
        },
        updatedAt: new Date(),
      },
      eq(kit.dbModule.onboardingWizardState.communityId, communityC.id),
    );

    // Complete the wizard
    const response = await appRoutes.onboarding.POST(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'POST', {
        communityId: communityC.id,
        skip: false,
      }),
    );

    expect(response.status).toBe(201);
    const json = await parseJson<{
      data: { success: boolean; status: string; completedAt: string };
    }>(response);

    expect(json.data.success).toBe(true);
    expect(json.data.status).toBe('completed');
    expect(json.data.completedAt).toBeDefined();

    // Verify units were created
    const createdUnits = await scoped.query(kit.dbModule.units);
    const onboardingUnits = createdUnits.filter((u) =>
      unitsData.some((ud) => ud.unitNumber === u['unitNumber']),
    );
    expect(onboardingUnits).toHaveLength(3);

    // Verify unit properties
    const unit1 = onboardingUnits.find((u) => u['unitNumber'] === `X101-${kit.runSuffix}`);
    expect(unit1?.['bedrooms']).toBe(2);
    expect(unit1?.['bathrooms']).toBe(1);
    expect(unit1?.['sqft']).toBe(850);
    expect(unit1?.['rentAmount']).toBe('1400.00');

    // Verify resident user was created
    const allUsers = await scoped.query(kit.dbModule.users);
    const residentUser = allUsers.find(
      (u) => (u['email'] as string).toLowerCase() === inviteData.email.toLowerCase(),
    );
    expect(residentUser).toBeDefined();
    expect(residentUser?.['fullName']).toBe(inviteData.fullName);

    // Track user for cleanup
    if (residentUser) {
      trackUserForCleanup(kit, residentUser['id'] as string);
    }

    // Verify resident has correct role
    const allRoles = await scoped.query(kit.dbModule.userRoles);
    const residentRole = allRoles.find((r) => r['userId'] === residentUser?.['id']);
    expect(residentRole?.['role']).toBe('tenant');

    // Verify unit assignment
    const assignedUnit = onboardingUnits.find((u) => u['unitNumber'] === inviteData.unitNumber);
    expect(residentRole?.['unitId']).toBe(assignedUnit?.['id']);

    // Verify invitation was created
    const allInvitations = await scoped.query(kit.dbModule.invitations);
    const invitation = allInvitations.find((i) => i['userId'] === residentUser?.['id']);
    expect(invitation).toBeDefined();
    expect(invitation?.['token']).toBeDefined();

    // Verify email was sent
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: inviteData.email,
        category: 'transactional',
      }),
    );

    // Verify community profile was updated
    const communityRows = await scoped.query(kit.dbModule.communities);
    const updatedCommunity = communityRows.find((c) => c['id'] === communityC.id);
    expect(updatedCommunity?.['name']).toBe(profileData.name);
    expect(updatedCommunity?.['addressLine1']).toBe(profileData.addressLine1);
    expect(updatedCommunity?.['city']).toBe(profileData.city);
    expect(updatedCommunity?.['state']).toBe(profileData.state);
    expect(updatedCommunity?.['zipCode']).toBe(profileData.zipCode);

    // Verify wizard status is completed
    const wizardRows = await scoped.query(kit.dbModule.onboardingWizardState);
    const wizard = wizardRows.find(
      (row) =>
        row['communityId'] === communityC.id &&
        row['wizardType'] === 'apartment',
    );
    expect(wizard?.['status']).toBe('completed');
    expect(wizard?.['completedAt']).toBeDefined();
  });

  it('POST: completion is idempotent via completionMarkers', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');
    const scoped = kit.dbModule.createScopedClient(communityC.id);

    // Setup wizard state
    const unitsData = [
      {
        unitNumber: `Y101-${kit.runSuffix}`,
        floor: 1,
        bedrooms: 1,
        bathrooms: 1,
        sqft: 600,
        rentAmount: '1100.00',
      },
    ];

    const inviteData = {
      email: `idempotent.resident+${kit.runSuffix}@example.com`,
      fullName: `Idempotent Resident ${kit.runSuffix}`,
      unitNumber: `Y101-${kit.runSuffix}`,
    };

    await scoped.update(
      kit.dbModule.onboardingWizardState,
      {
        stepData: {
          unitsTable: unitsData,
          inviteEmail: inviteData,
        },
        updatedAt: new Date(),
      },
      eq(kit.dbModule.onboardingWizardState.communityId, communityC.id),
    );

    // First completion
    const response1 = await appRoutes.onboarding.POST(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'POST', {
        communityId: communityC.id,
        skip: false,
      }),
    );
    expect(response1.status).toBe(201);

    const unitsBefore = await scoped.query(kit.dbModule.units);
    const unitsBeforeCount = unitsBefore.filter((u) =>
      u['unitNumber'] === `Y101-${kit.runSuffix}`,
    ).length;

    const usersBefore = await scoped.query(kit.dbModule.users);
    const userBefore = usersBefore.find(
      (u) => (u['email'] as string).toLowerCase() === inviteData.email.toLowerCase(),
    );
    if (userBefore) {
      trackUserForCleanup(kit, userBefore['id'] as string);
    }

    const invitationsBefore = await scoped.query(kit.dbModule.invitations);
    const invitationsBeforeCount = invitationsBefore.filter(
      (i) => i['userId'] === userBefore?.['id'],
    ).length;

    // Second completion (should be idempotent)
    const response2 = await appRoutes.onboarding.POST(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'POST', {
        communityId: communityC.id,
        skip: false,
      }),
    );
    expect(response2.status).toBe(201);

    // Verify no duplicates were created
    const unitsAfter = await scoped.query(kit.dbModule.units);
    const unitsAfterCount = unitsAfter.filter((u) =>
      u['unitNumber'] === `Y101-${kit.runSuffix}`,
    ).length;
    expect(unitsAfterCount).toBe(unitsBeforeCount);

    const usersAfter = await scoped.query(kit.dbModule.users);
    const usersAfterFiltered = usersAfter.filter(
      (u) => (u['email'] as string).toLowerCase() === inviteData.email.toLowerCase(),
    );
    expect(usersAfterFiltered).toHaveLength(1);

    const invitationsAfter = await scoped.query(kit.dbModule.invitations);
    const invitationsAfterCount = invitationsAfter.filter(
      (i) => i['userId'] === userBefore?.['id'],
    ).length;
    expect(invitationsAfterCount).toBe(invitationsBeforeCount);
  });

  it('POST: skip=true marks wizard as skipped without creating resources', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');
    const scoped = kit.dbModule.createScopedClient(communityC.id);

    // Get units count before skip
    const unitsBefore = await scoped.query(kit.dbModule.units);
    const unitsBeforeCount = unitsBefore.length;

    const response = await appRoutes.onboarding.POST(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'POST', {
        communityId: communityC.id,
        skip: true,
      }),
    );

    expect(response.status).toBe(200);
    const json = await parseJson<{ data: { success: boolean; status: string } }>(response);

    expect(json.data.success).toBe(true);
    expect(json.data.status).toBe('skipped');

    // Verify wizard status
    const wizardRows = await scoped.query(kit.dbModule.onboardingWizardState);
    const wizard = wizardRows.find(
      (row) =>
        row['communityId'] === communityC.id &&
        row['wizardType'] === 'apartment',
    );
    expect(wizard?.['status']).toBe('skipped');
    expect(wizard?.['completedAt']).toBeNull();

    // Verify no units were created
    const unitsAfter = await scoped.query(kit.dbModule.units);
    expect(unitsAfter.length).toBe(unitsBeforeCount);

    // Verify no email was sent during skip
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('POST: non-site_manager/property_manager_admin gets 403', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');

    // Use tenant user
    setActor(kit, 'tenantC');

    const response = await appRoutes.onboarding.POST(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'POST', {
        communityId: communityC.id,
        skip: false,
      }),
    );

    expect(response.status).toBe(403);
  });

  // =========================================================================
  // End-to-end flow
  // =========================================================================

  it('E2E: complete onboarding flow from initialization to completion', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');
    const scoped = kit.dbModule.createScopedClient(communityC.id);

    // Step 1: Initialize wizard (GET)
    const getResponse = await appRoutes.onboarding.GET(
      new NextRequest(apiUrl(`/api/v1/onboarding/apartment?communityId=${communityC.id}`)),
    );
    expect(getResponse.status).toBe(200);
    const initialState = await parseJson<{ data: { status: string; currentStep: number } }>(
      getResponse,
    );
    expect(initialState.data.status).toBe('in_progress');
    expect(initialState.data.currentStep).toBe(0);

    // Step 2: Save profile (PATCH step 1)
    const profileData = {
      name: `E2E Test Community ${kit.runSuffix}`,
      addressLine1: '789 Pine Street',
      city: 'Orlando',
      state: 'FL',
      zipCode: '32801',
      timezone: 'America/New_York',
    };

    const patch1Response = await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        currentStep: 1,
        stepData: { profile: profileData },
      }),
    );
    expect(patch1Response.status).toBe(200);

    // Step 3: Save units (PATCH step 2)
    const unitsData = [
      {
        unitNumber: `Z101-${kit.runSuffix}`,
        floor: 1,
        bedrooms: 2,
        bathrooms: 1,
        sqft: 900,
        rentAmount: '1450.00',
      },
      {
        unitNumber: `Z102-${kit.runSuffix}`,
        floor: 1,
        bedrooms: 1,
        bathrooms: 1,
        sqft: 650,
        rentAmount: '1150.00',
      },
    ];

    const patch2Response = await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        currentStep: 2,
        stepData: { unitsTable: unitsData },
      }),
    );
    expect(patch2Response.status).toBe(200);

    // Step 4: Skip rules (PATCH step 3)
    const patch3Response = await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        currentStep: 3,
        stepData: { rulesDoc: null },
      }),
    );
    expect(patch3Response.status).toBe(200);

    // Step 5: Save invite (PATCH step 4)
    const inviteData = {
      email: `e2e.resident+${kit.runSuffix}@example.com`,
      fullName: `E2E Resident ${kit.runSuffix}`,
      unitNumber: `Z101-${kit.runSuffix}`,
    };

    const patch4Response = await appRoutes.onboarding.PATCH(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'PATCH', {
        communityId: communityC.id,
        currentStep: 4,
        stepData: { inviteEmail: inviteData },
      }),
    );
    expect(patch4Response.status).toBe(200);

    // Step 6: Complete wizard (POST)
    const postResponse = await appRoutes.onboarding.POST(
      jsonRequest(apiUrl('/api/v1/onboarding/apartment'), 'POST', {
        communityId: communityC.id,
        skip: false,
      }),
    );
    expect(postResponse.status).toBe(201);
    const completion = await parseJson<{ data: { status: string } }>(postResponse);
    expect(completion.data.status).toBe('completed');

    // Step 7: Verify all resources were created
    const units = await scoped.query(kit.dbModule.units);
    const createdUnits = units.filter((u) =>
      unitsData.some((ud) => ud.unitNumber === u['unitNumber']),
    );
    expect(createdUnits).toHaveLength(2);

    const users = await scoped.query(kit.dbModule.users);
    const resident = users.find(
      (u) => (u['email'] as string).toLowerCase() === inviteData.email.toLowerCase(),
    );
    expect(resident).toBeDefined();
    if (resident) {
      trackUserForCleanup(kit, resident['id'] as string);
    }

    const invitations = await scoped.query(kit.dbModule.invitations);
    const invitation = invitations.find((i) => i['userId'] === resident?.['id']);
    expect(invitation).toBeDefined();

    const communities = await scoped.query(kit.dbModule.communities);
    const community = communities.find((c) => c['id'] === communityC.id);
    expect(community?.['name']).toBe(profileData.name);

    // Step 8: Verify second GET shows completed status
    const finalGetResponse = await appRoutes.onboarding.GET(
      new NextRequest(apiUrl(`/api/v1/onboarding/apartment?communityId=${communityC.id}`)),
    );
    expect(finalGetResponse.status).toBe(200);
    const finalState = await parseJson<{ data: { status: string; completedAt: string | null } }>(
      finalGetResponse,
    );
    expect(finalState.data.status).toBe('completed');
    expect(finalState.data.completedAt).toBeDefined();
  });
});
