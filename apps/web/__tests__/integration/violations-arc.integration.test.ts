import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from '@propertypro/db/filters';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS, type MultiTenantUserKey } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  apiUrl,
  getDescribeDb,
  requireUser,
  initTestKit,
  jsonRequest,
  parseJson,
  readNumberField,
  requireCommunity,
  requireDatabaseUrlInCI,
  seedCommunities,
  seedUsers,
  setActor,
  teardownTestKit,
} from './helpers/multi-tenant-test-kit';
import { getCapturedNotifications } from './providers/test-capture-sinks';

requireDatabaseUrlInCI('WS67 violations/ARC integration tests');

const describeDb = getDescribeDb();

type ViolationsRouteModule = typeof import('../../src/app/api/v1/violations/route');
type ViolationRouteModule = typeof import('../../src/app/api/v1/violations/[id]/route');
type ViolationFineRouteModule = typeof import('../../src/app/api/v1/violations/[id]/fine/route');
type ViolationResolveRouteModule = typeof import('../../src/app/api/v1/violations/[id]/resolve/route');
type ArcRouteModule = typeof import('../../src/app/api/v1/arc/route');
type ArcReviewRouteModule = typeof import('../../src/app/api/v1/arc/[id]/review/route');
type ArcDecideRouteModule = typeof import('../../src/app/api/v1/arc/[id]/decide/route');
type ArcWithdrawRouteModule = typeof import('../../src/app/api/v1/arc/[id]/withdraw/route');

interface RouteModules {
  violations: ViolationsRouteModule;
  violationDetail: ViolationRouteModule;
  violationFine: ViolationFineRouteModule;
  violationResolve: ViolationResolveRouteModule;
  arc: ArcRouteModule;
  arcReview: ArcReviewRouteModule;
  arcDecide: ArcDecideRouteModule;
  arcWithdraw: ArcWithdrawRouteModule;
}

let state: TestKitState | null = null;
let routes: RouteModules | null = null;
let unitAId: number;
let unitBId: number;

function requireState(): TestKitState {
  if (!state) {
    throw new Error('Test state not initialized');
  }
  return state;
}

function requireRoutes(): RouteModules {
  if (!routes) {
    throw new Error('Route modules not loaded');
  }
  return routes;
}

describeDb('WS67 violations/ARC (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    const selectedCommunities = MULTI_TENANT_COMMUNITIES.filter((community) =>
      ['communityA', 'communityB', 'communityC'].includes(community.key),
    );
    await seedCommunities(state, selectedCommunities);

    const neededUsers: MultiTenantUserKey[] = ['actorA', 'tenantA', 'actorB', 'actorC'];
    const communityA = requireCommunity(state, 'communityA');
    const communityB = requireCommunity(state, 'communityB');
    const scopedA = state.dbModule.createScopedClient(communityA.id);
    const scopedB = state.dbModule.createScopedClient(communityB.id);

    const [unitA] = await scopedA.insert(state.dbModule.units, {
      unitNumber: `VIO-A-${state.runSuffix}`,
      building: 'A',
      floor: 1,
    });
    const [unitB] = await scopedB.insert(state.dbModule.units, {
      unitNumber: `VIO-B-${state.runSuffix}`,
      building: 'B',
      floor: 2,
    });
    unitAId = readNumberField(unitA, 'id');
    unitBId = readNumberField(unitB, 'id');

    const unitMap = new Map<MultiTenantUserKey, number>();
    unitMap.set('tenantA', unitAId);

    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((user) => neededUsers.includes(user.key)),
      unitMap,
    );

    routes = {
      violations: await import('../../src/app/api/v1/violations/route'),
      violationDetail: await import('../../src/app/api/v1/violations/[id]/route'),
      violationFine: await import('../../src/app/api/v1/violations/[id]/fine/route'),
      violationResolve: await import('../../src/app/api/v1/violations/[id]/resolve/route'),
      arc: await import('../../src/app/api/v1/arc/route'),
      arcReview: await import('../../src/app/api/v1/arc/[id]/review/route'),
      arcDecide: await import('../../src/app/api/v1/arc/[id]/decide/route'),
      arcWithdraw: await import('../../src/app/api/v1/arc/[id]/withdraw/route'),
    };
  });

  beforeEach(() => {
    const kit = requireState();
    setActor(kit, 'actorA');
  });

  afterAll(async () => {
    if (state) {
      await teardownTestKit(state);
    }
  });

  it('runs violation report -> notice -> fine -> resolve lifecycle', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'tenantA');
    const reportResponse = await routeModules.violations.POST(
      jsonRequest(apiUrl('/api/v1/violations'), 'POST', {
        communityId: communityA.id,
        unitId: unitAId,
        category: 'parking',
        description: `Unauthorized parking ${kit.runSuffix}`,
        severity: 'moderate',
      }),
    );
    expect(reportResponse.status).toBe(201);
    const reportJson = await parseJson<{ data: Record<string, unknown> }>(reportResponse);
    const violationId = readNumberField(reportJson.data, 'id');

    setActor(kit, 'actorA');
    const noticeResponse = await routeModules.violationDetail.PATCH(
      jsonRequest(apiUrl(`/api/v1/violations/${violationId}`), 'PATCH', {
        communityId: communityA.id,
        status: 'noticed',
      }),
      { params: Promise.resolve({ id: String(violationId) }) },
    );
    expect(noticeResponse.status).toBe(200);
    const noticeNotifications = getCapturedNotifications().filter(
      (entry) =>
        entry.communityId === communityA.id
        && entry.event.type === 'compliance_alert'
        && entry.event.sourceId === String(violationId),
    );
    expect(noticeNotifications.length).toBeGreaterThan(0);

    const fineResponse = await routeModules.violationFine.POST(
      jsonRequest(apiUrl(`/api/v1/violations/${violationId}/fine`), 'POST', {
        communityId: communityA.id,
        amountCents: 12500,
        graceDays: 10,
      }),
      { params: Promise.resolve({ id: String(violationId) }) },
    );
    expect(fineResponse.status).toBe(201);
    const fineJson = await parseJson<{ data: Record<string, unknown> }>(fineResponse);
    const lineItemId = readNumberField(fineJson.data, 'lineItemId');
    const fineId = readNumberField(fineJson.data.fine as Record<string, unknown>, 'id');

    const scopedA = kit.dbModule.createScopedClient(communityA.id);
    const lineItems = await scopedA.selectFrom<{ id: number; assessmentId: number | null; unitId: number }>(
      kit.dbModule.assessmentLineItems,
      {},
      eq(kit.dbModule.assessmentLineItems.id, lineItemId),
    );
    expect(lineItems).toHaveLength(1);
    expect(lineItems[0]?.assessmentId).toBeNull();
    expect(lineItems[0]?.unitId).toBe(unitAId);

    const fines = await scopedA.selectFrom<{ id: number; status: string }>(
      kit.dbModule.violationFines,
      {},
      eq(kit.dbModule.violationFines.id, fineId),
    );
    expect(fines).toHaveLength(1);
    expect(fines[0]?.status).toBe('pending');

    const resolveResponse = await routeModules.violationResolve.POST(
      jsonRequest(apiUrl(`/api/v1/violations/${violationId}/resolve`), 'POST', {
        communityId: communityA.id,
        resolutionNotes: 'Issue corrected',
      }),
      { params: Promise.resolve({ id: String(violationId) }) },
    );
    expect(resolveResponse.status).toBe(200);
    const resolveJson = await parseJson<{ data: Record<string, unknown> }>(resolveResponse);
    expect(resolveJson.data.status).toBe('resolved');
  });

  it('runs ARC submit -> review -> decide and owner withdraw flow', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'tenantA');
    const submitResponse = await routeModules.arc.POST(
      jsonRequest(apiUrl('/api/v1/arc'), 'POST', {
        communityId: communityA.id,
        unitId: unitAId,
        title: `Fence update ${kit.runSuffix}`,
        description: 'Replace fence and repaint exterior trim',
        projectType: 'fencing',
      }),
    );
    expect(submitResponse.status).toBe(201);
    const submitJson = await parseJson<{ data: Record<string, unknown> }>(submitResponse);
    const submissionId = readNumberField(submitJson.data, 'id');

    setActor(kit, 'actorA');
    const reviewResponse = await routeModules.arcReview.PATCH(
      jsonRequest(apiUrl(`/api/v1/arc/${submissionId}/review`), 'PATCH', {
        communityId: communityA.id,
        reviewNotes: 'Need updated color palette in attachment',
      }),
      { params: Promise.resolve({ id: String(submissionId) }) },
    );
    expect(reviewResponse.status).toBe(200);

    const decideResponse = await routeModules.arcDecide.POST(
      jsonRequest(apiUrl(`/api/v1/arc/${submissionId}/decide`), 'POST', {
        communityId: communityA.id,
        decision: 'approved',
        reviewNotes: 'Approved with existing conditions',
      }),
      { params: Promise.resolve({ id: String(submissionId) }) },
    );
    expect(decideResponse.status).toBe(200);
    const decideJson = await parseJson<{ data: Record<string, unknown> }>(decideResponse);
    expect(decideJson.data.status).toBe('approved');
    const tenantA = requireUser(kit, 'tenantA');
    const arcNotifications = getCapturedNotifications().filter(
      (entry) =>
        entry.communityId === communityA.id
        && entry.event.type === 'compliance_alert'
        && entry.event.sourceId === String(submissionId)
        && typeof entry.recipientFilter === 'object'
        && entry.recipientFilter.type === 'specific_user'
        && entry.recipientFilter.userId === tenantA.id,
    );
    expect(arcNotifications.length).toBeGreaterThan(0);

    setActor(kit, 'tenantA');
    const submitForWithdrawResponse = await routeModules.arc.POST(
      jsonRequest(apiUrl('/api/v1/arc'), 'POST', {
        communityId: communityA.id,
        unitId: unitAId,
        title: `Landscaping update ${kit.runSuffix}`,
        description: 'Front-yard landscaping refresh',
        projectType: 'landscaping',
      }),
    );
    expect(submitForWithdrawResponse.status).toBe(201);
    const submitForWithdrawJson = await parseJson<{ data: Record<string, unknown> }>(submitForWithdrawResponse);
    const withdrawSubmissionId = readNumberField(submitForWithdrawJson.data, 'id');

    const withdrawResponse = await routeModules.arcWithdraw.POST(
      jsonRequest(apiUrl(`/api/v1/arc/${withdrawSubmissionId}/withdraw`), 'POST', {
        communityId: communityA.id,
      }),
      { params: Promise.resolve({ id: String(withdrawSubmissionId) }) },
    );
    expect(withdrawResponse.status).toBe(200);
    const withdrawJson = await parseJson<{ data: Record<string, unknown> }>(withdrawResponse);
    expect(withdrawJson.data.status).toBe('withdrawn');
  });

  it('enforces cross-tenant isolation and apartment feature gating', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityB = requireCommunity(kit, 'communityB');
    const communityC = requireCommunity(kit, 'communityC');

    setActor(kit, 'actorA');
    const reportResponse = await routeModules.violations.POST(
      jsonRequest(apiUrl('/api/v1/violations'), 'POST', {
        communityId: communityA.id,
        unitId: unitAId,
        category: 'noise',
        description: 'Cross-tenant isolation seed',
      }),
    );
    expect(reportResponse.status).toBe(201);
    const reportJson = await parseJson<{ data: Record<string, unknown> }>(reportResponse);
    const violationId = readNumberField(reportJson.data, 'id');

    setActor(kit, 'actorB');
    const crossTenantRead = await routeModules.violationDetail.GET(
      new NextRequest(apiUrl(`/api/v1/violations/${violationId}?communityId=${communityB.id}`)),
      { params: Promise.resolve({ id: String(violationId) }) },
    );
    expect([403, 404]).toContain(crossTenantRead.status);

    setActor(kit, 'actorC');
    const apartmentViolations = await routeModules.violations.GET(
      new NextRequest(apiUrl(`/api/v1/violations?communityId=${communityC.id}`)),
    );
    expect(apartmentViolations.status).toBe(403);

    const apartmentArc = await routeModules.arc.GET(
      new NextRequest(apiUrl(`/api/v1/arc?communityId=${communityC.id}`)),
    );
    expect(apartmentArc.status).toBe(403);
  });
});
