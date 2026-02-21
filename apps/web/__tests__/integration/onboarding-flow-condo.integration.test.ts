/**
 * Condo Onboarding flow integration test — P2-39
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

const { requireAuthenticatedUserIdMock } = vi.hoisted(() => ({
    requireAuthenticatedUserIdMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
    requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

type OnboardingRouteModule = typeof import('../../src/app/api/v1/onboarding/condo/route');
type ComplianceRouteModule = typeof import('../../src/app/api/v1/compliance/route');

interface RouteModules {
    onboarding: OnboardingRouteModule;
    compliance: ComplianceRouteModule;
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
        eq(kit.dbModule.onboardingWizardState.wizardType, 'condo'),
    );
}

describeDb('condo onboarding flow (db-backed integration)', () => {
    let testDocumentId: number;
    let communityACategoryId: number;
    let communityCCategoryId: number;

    beforeAll(async () => {
        if (!process.env.DATABASE_URL) return;

        state = await initTestKit();

        const communityA = MULTI_TENANT_COMMUNITIES.find((community) => community.key === 'communityA');
        const communityC = MULTI_TENANT_COMMUNITIES.find((community) => community.key === 'communityC');
        if (!communityA || !communityC) {
            throw new Error('Required community fixtures not found');
        }

        await seedCommunities(state, [communityA, communityC]);

        const siteManagerA = MULTI_TENANT_USERS.find((user) => user.key === 'siteManagerA');
        const siteManagerC = MULTI_TENANT_USERS.find((user) => user.key === 'siteManagerC');
        const actorA = MULTI_TENANT_USERS.find((user) => user.key === 'actorA');
        if (!siteManagerA || !siteManagerC || !actorA) {
            throw new Error('Required user fixtures not found');
        }

        await seedUsers(state, [siteManagerA, siteManagerC, actorA]);

        const seededCommunityA = requireCommunity(state, 'communityA');
        const seededCommunityC = requireCommunity(state, 'communityC');
        const seededSiteManagerA = state.users.get('siteManagerA');
        if (!seededSiteManagerA) throw new Error('siteManagerA not seeded');

        // Setup a dummy document for step 0
        const scopedAdmin = state.dbModule.createScopedClient(seededCommunityA.id);
        const insertedDocs = await scopedAdmin.insert(state.dbModule.documents, {
            title: 'Dummy Statutory Doc',
            filePath: 'documents/dummy.pdf',
            fileName: 'dummy.pdf',
            fileSize: 1024,
            mimeType: 'application/pdf',
            uploadedBy: seededSiteManagerA.id,
            extractionStatus: 'pending',
        });

        testDocumentId = Number(insertedDocs[0].id);

        const insertedCategoryA = await scopedAdmin.insert(state.dbModule.documentCategories, {
            name: `P2-39 Governing A ${state.runSuffix}`,
            description: 'Category for condo onboarding integration tests',
            isSystem: false,
        });
        communityACategoryId = Number(insertedCategoryA[0].id);

        const scopedCommunityC = state.dbModule.createScopedClient(seededCommunityC.id);
        const insertedCategoryC = await scopedCommunityC.insert(state.dbModule.documentCategories, {
            name: `P2-39 Ops C ${state.runSuffix}`,
            description: 'Category for cross-tenant validation tests',
            isSystem: false,
        });
        communityCCategoryId = Number(insertedCategoryC[0].id);

        routes = {
            onboarding: await import('../../src/app/api/v1/onboarding/condo/route'),
            compliance: await import('../../src/app/api/v1/compliance/route'),
        };
    });

    beforeEach(() => {
        vi.clearAllMocks();
        const kit = requireState();
        requireAuthenticatedUserIdMock.mockImplementation(async () => requireCurrentActor(kit));
        setActor(kit, 'siteManagerA');
    });

    afterAll(async () => {
        if (state) await teardownTestKit(state);
    });

    it('3-step condo progression persists and links compliance items', async () => {
        const kit = requireState();
        const appRoutes = requireRoutes();
        const communityA = requireCommunity(kit, 'communityA'); // condo_718

        await clearWizardState(kit, communityA.id);

        // 1. Generate compliance items so they exist for linking
        const generateRes = await appRoutes.compliance.POST(
            jsonRequest(apiUrl('/api/v1/compliance'), 'POST', {
                communityId: communityA.id,
                communityType: 'condo_718',
            })
        );
        expect(generateRes.status).toBe(201); // Created

        // Get them just to find a template key
        const scoped = kit.dbModule.createScopedClient(communityA.id);
        const checklistItems = await scoped.query(kit.dbModule.complianceChecklistItems);
        expect(checklistItems.length).toBeGreaterThan(0);
        const targetTemplateKey = checklistItems[0]['templateKey'] as string;

        const statutoryData = {
            items: [
                {
                    templateKey: targetTemplateKey,
                    documentId: testDocumentId,
                    categoryId: communityACategoryId,
                },
            ],
        };

        const profileData = {
            name: `Condo Wizard Progression ${kit.runSuffix}`,
            addressLine1: '123 Condo Street',
            city: 'Miami',
            state: 'FL',
            zipCode: '33101',
            timezone: 'America/New_York',
        };

        const unitsData = [
            {
                unitNumber: `P2-39-C101-${kit.runSuffix}`,
                floor: 1,
                bedrooms: 2,
                bathrooms: 2,
            },
            {
                unitNumber: `P2-39-C102-${kit.runSuffix}`,
                floor: 1,
                bedrooms: 3,
                bathrooms: 2,
            },
        ];

        // GET empty state
        const getResponse = await appRoutes.onboarding.GET(
            new NextRequest(apiUrl(`/api/v1/onboarding/condo?communityId=${communityA.id}`)),
        );
        expect(getResponse.status).toBe(200);
        const getJson = await parseJson<{
            data: { status: string; lastCompletedStep: number | null; nextStep: number };
        }>(getResponse);
        expect(getJson.data.status).toBe('in_progress');
        expect(getJson.data.lastCompletedStep).toBeNull();
        expect(getJson.data.nextStep).toBe(0);

        // Step 0: Statutory
        const patchStep0 = await appRoutes.onboarding.PATCH(
            jsonRequest(apiUrl('/api/v1/onboarding/condo'), 'PATCH', {
                communityId: communityA.id,
                step: 0,
                stepData: { statutory: statutoryData },
            }),
        );
        expect(patchStep0.status).toBe(200);

        // Verify statutory linked
        const updatedItems = await scoped.query(kit.dbModule.complianceChecklistItems);
        const linkedItem = updatedItems.find(i => i['templateKey'] === targetTemplateKey);
        expect(linkedItem?.['documentId']).toBe(testDocumentId);

        // Step 1: Profile
        const patchStep1 = await appRoutes.onboarding.PATCH(
            jsonRequest(apiUrl('/api/v1/onboarding/condo'), 'PATCH', {
                communityId: communityA.id,
                step: 1,
                stepData: { profile: profileData },
            }),
        );
        expect(patchStep1.status).toBe(200);

        // Step 2: Units
        const patchStep2 = await appRoutes.onboarding.PATCH(
            jsonRequest(apiUrl('/api/v1/onboarding/condo'), 'PATCH', {
                communityId: communityA.id,
                step: 2,
                stepData: { units: unitsData },
            }),
        );
        expect(patchStep2.status).toBe(200);

        // Resume from GET
        const resumeGet = await appRoutes.onboarding.GET(
            new NextRequest(apiUrl(`/api/v1/onboarding/condo?communityId=${communityA.id}`)),
        );
        expect(resumeGet.status).toBe(200);
        const resumeJson = await parseJson<{
            data: {
                lastCompletedStep: number | null;
                nextStep: number;
                stepData: {
                    statutory?: Record<string, unknown>;
                    profile?: Record<string, unknown>;
                    units?: Array<Record<string, unknown>>;
                };
            };
        }>(resumeGet);

        expect(resumeJson.data.lastCompletedStep).toBe(2);
        expect(resumeJson.data.nextStep).toBe(2); // max 2
        expect(resumeJson.data.stepData.profile?.name).toBe(profileData.name);
        expect(resumeJson.data.stepData.units).toHaveLength(2);

        // Complete
        const complete = await appRoutes.onboarding.POST(
            jsonRequest(apiUrl('/api/v1/onboarding/condo'), 'POST', {
                communityId: communityA.id,
                action: 'complete',
            }),
        );
        expect(complete.status).toBe(201);

        // Verify Units Created
        const unitRows = await scoped.query(kit.dbModule.units);
        const createdUnits = unitRows.filter((row) =>
            unitsData.some((unit) => unit.unitNumber === row['unitNumber']),
        );
        expect(createdUnits).toHaveLength(2);

        // Verify Wizard State
        const wizardRows = await scoped.query(kit.dbModule.onboardingWizardState);
        const wizard = wizardRows.find((row) => row['wizardType'] === 'condo');
        expect(wizard?.['status']).toBe('completed');
    });

    it('feature gate: apartment community returns 403 on GET condo wizard', async () => {
        const kit = requireState();
        const appRoutes = requireRoutes();
        const communityC = requireCommunity(kit, 'communityC'); // apartment

        setActor(kit, 'siteManagerC');
        const response = await appRoutes.onboarding.GET(
            new NextRequest(apiUrl(`/api/v1/onboarding/condo?communityId=${communityC.id}`)),
        );
        expect(response.status).toBe(403);
    });

    it('rejects invalid statutory template keys without partial updates', async () => {
        const kit = requireState();
        const appRoutes = requireRoutes();
        const communityA = requireCommunity(kit, 'communityA');
        await clearWizardState(kit, communityA.id);

        const generateRes = await appRoutes.compliance.POST(
            jsonRequest(apiUrl('/api/v1/compliance'), 'POST', {
                communityId: communityA.id,
                communityType: 'condo_718',
            }),
        );
        expect([200, 201]).toContain(generateRes.status);

        const scopedA = kit.dbModule.createScopedClient(communityA.id);
        const checklistBefore = await scopedA.query(kit.dbModule.complianceChecklistItems);
        const docIdsBeforeByTemplate = new Map(
            checklistBefore.map((row) => [
                String(row['templateKey']),
                (row['documentId'] as number | null) ?? null,
            ]),
        );

        const response = await appRoutes.onboarding.PATCH(
            jsonRequest(apiUrl('/api/v1/onboarding/condo'), 'PATCH', {
                communityId: communityA.id,
                step: 0,
                stepData: {
                    statutory: {
                        items: [
                            {
                                templateKey: 'missing_template_key',
                                documentId: testDocumentId,
                                categoryId: communityACategoryId,
                            },
                        ],
                    },
                },
            }),
        );
        expect(response.status).toBe(400);
        const json = await parseJson<{ error?: { code: string; message: string; details?: unknown } }>(response);
        expect(json.error?.message ?? '').toContain('Checklist template keys not found');

        const checklistAfter = await scopedA.query(kit.dbModule.complianceChecklistItems);
        for (const row of checklistAfter) {
            const templateKey = String(row['templateKey']);
            const before = docIdsBeforeByTemplate.get(templateKey);
            expect((row['documentId'] as number | null) ?? null).toBe(before ?? null);
        }
    });

    it('rejects categoryId from another community', async () => {
        const kit = requireState();
        const appRoutes = requireRoutes();
        const communityA = requireCommunity(kit, 'communityA');

        const generateRes = await appRoutes.compliance.POST(
            jsonRequest(apiUrl('/api/v1/compliance'), 'POST', {
                communityId: communityA.id,
                communityType: 'condo_718',
            }),
        );
        expect([200, 201]).toContain(generateRes.status);

        const scopedA = kit.dbModule.createScopedClient(communityA.id);
        const checklistItems = await scopedA.query(kit.dbModule.complianceChecklistItems);
        const targetTemplateKey = String(checklistItems[0]?.['templateKey']);
        if (!targetTemplateKey) {
            throw new Error('Expected at least one checklist item in community A');
        }

        const response = await appRoutes.onboarding.PATCH(
            jsonRequest(apiUrl('/api/v1/onboarding/condo'), 'PATCH', {
                communityId: communityA.id,
                step: 0,
                stepData: {
                    statutory: {
                        items: [{
                            templateKey: targetTemplateKey,
                            documentId: testDocumentId,
                            categoryId: communityCCategoryId,
                        }],
                    },
                },
            }),
        );
        expect(response.status).toBe(400);
        const json = await parseJson<{ error?: { code: string; message: string; details?: unknown } }>(response);
        expect(json.error?.message ?? '').toContain('Document categories not found in this community');
    });

    it('rejects documentId from another community', async () => {
        const kit = requireState();
        const appRoutes = requireRoutes();

        // Create document in Community C
        const communityC = requireCommunity(kit, 'communityC');
        const scopedC = kit.dbModule.createScopedClient(communityC.id);
        const siteManagerC = kit.users.get('siteManagerC');
        if (!siteManagerC) {
            throw new Error('siteManagerC not seeded');
        }
        const docC = await scopedC.insert(kit.dbModule.documents, {
            title: 'Cross-Tenant Doc',
            filePath: 'documents/cross.pdf',
            fileName: 'cross.pdf',
            fileSize: 1024,
            mimeType: 'application/pdf',
            uploadedBy: siteManagerC.id,
            extractionStatus: 'pending',
        });

        // Try to use that document in Community A's wizard
        const communityA = requireCommunity(kit, 'communityA');
        const generateRes = await appRoutes.compliance.POST(
            jsonRequest(apiUrl('/api/v1/compliance'), 'POST', {
                communityId: communityA.id,
                communityType: 'condo_718',
            }),
        );
        expect([200, 201]).toContain(generateRes.status);

        const scopedA = kit.dbModule.createScopedClient(communityA.id);
        const checklistItems = await scopedA.query(kit.dbModule.complianceChecklistItems);
        const targetTemplateKey = String(checklistItems[0]?.['templateKey']);
        if (!targetTemplateKey) {
            throw new Error('Expected at least one checklist item in community A');
        }

        const res = await appRoutes.onboarding.PATCH(
            jsonRequest(apiUrl('/api/v1/onboarding/condo'), 'PATCH', {
                communityId: communityA.id,
                step: 0,
                stepData: {
                    statutory: {
                        items: [{
                            templateKey: targetTemplateKey,
                            documentId: Number(docC[0].id), // From Community C!
                            categoryId: communityACategoryId,
                        }],
                    },
                },
            }),
        );

        expect(res.status).toBe(400);
        const json = await parseJson<{ error?: { code: string; message: string; details?: unknown } }>(res);
        expect(json.error?.message ?? '').toContain('Documents not found in this community');
    });

    it('rejects completing wizard when units are missing', async () => {
        const kit = requireState();
        const appRoutes = requireRoutes();
        const communityA = requireCommunity(kit, 'communityA');

        await clearWizardState(kit, communityA.id);

        const response = await appRoutes.onboarding.POST(
            jsonRequest(apiUrl('/api/v1/onboarding/condo'), 'POST', {
                communityId: communityA.id,
                action: 'complete',
            }),
        );

        expect(response.status).toBe(400);
        const json = await parseJson<{ error?: { code: string; message: string; details?: unknown } }>(response);
        expect(json.error?.message ?? '').toContain('At least one unit is required before completing onboarding.');
    });
});
