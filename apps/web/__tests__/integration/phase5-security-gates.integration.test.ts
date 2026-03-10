import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS, type MultiTenantUserKey } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  apiUrl,
  getDescribeDb,
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

requireDatabaseUrlInCI('WS72 phase5 security gate integration tests');

const describeDb = getDescribeDb();

type AssessmentsRouteModule = typeof import('../../src/app/api/v1/assessments/route');
type LedgerRouteModule = typeof import('../../src/app/api/v1/ledger/route');
type ViolationsRouteModule = typeof import('../../src/app/api/v1/violations/route');
type ViolationDetailRouteModule = typeof import('../../src/app/api/v1/violations/[id]/route');
type ArcRouteModule = typeof import('../../src/app/api/v1/arc/route');
type ArcDetailRouteModule = typeof import('../../src/app/api/v1/arc/[id]/route');
type PollsRouteModule = typeof import('../../src/app/api/v1/polls/route');
type PollResultsRouteModule = typeof import('../../src/app/api/v1/polls/[id]/results/route');
type VendorsRouteModule = typeof import('../../src/app/api/v1/vendors/route');
type WorkOrdersRouteModule = typeof import('../../src/app/api/v1/work-orders/route');
type WorkOrderDetailRouteModule = typeof import('../../src/app/api/v1/work-orders/[id]/route');
type AmenitiesRouteModule = typeof import('../../src/app/api/v1/amenities/route');
type AmenityScheduleRouteModule = typeof import('../../src/app/api/v1/amenities/[id]/schedule/route');
type PackagesRouteModule = typeof import('../../src/app/api/v1/packages/route');
type VisitorsRouteModule = typeof import('../../src/app/api/v1/visitors/route');
type GoogleConnectRouteModule = typeof import('../../src/app/api/v1/calendar/google/connect/route');
type GoogleCallbackRouteModule = typeof import('../../src/app/api/v1/calendar/google/callback/route');
type GoogleSyncRouteModule = typeof import('../../src/app/api/v1/calendar/google/sync/route');
type AccountingConnectRouteModule = typeof import('../../src/app/api/v1/accounting/connect/route');
type AccountingCallbackRouteModule = typeof import('../../src/app/api/v1/accounting/callback/route');
type AccountingMappingRouteModule = typeof import('../../src/app/api/v1/accounting/mapping/route');

interface RouteModules {
  assessments: AssessmentsRouteModule;
  ledger: LedgerRouteModule;
  violations: ViolationsRouteModule;
  violationDetail: ViolationDetailRouteModule;
  arc: ArcRouteModule;
  arcDetail: ArcDetailRouteModule;
  polls: PollsRouteModule;
  pollResults: PollResultsRouteModule;
  vendors: VendorsRouteModule;
  workOrders: WorkOrdersRouteModule;
  workOrderDetail: WorkOrderDetailRouteModule;
  amenities: AmenitiesRouteModule;
  amenitySchedule: AmenityScheduleRouteModule;
  packages: PackagesRouteModule;
  visitors: VisitorsRouteModule;
  googleConnect: GoogleConnectRouteModule;
  googleCallback: GoogleCallbackRouteModule;
  googleSync: GoogleSyncRouteModule;
  accountingConnect: AccountingConnectRouteModule;
  accountingCallback: AccountingCallbackRouteModule;
  accountingMapping: AccountingMappingRouteModule;
}

let state: TestKitState | null = null;
let routes: RouteModules | null = null;
let unitAId: number;
let unitCId: number;

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

async function expectAuditEventForRequestId(
  kit: TestKitState,
  communityId: number,
  requestId: string,
): Promise<void> {
  const scoped = kit.dbModule.createScopedClient(communityId);
  const rows = await scoped.selectFrom<{
    metadata: Record<string, unknown> | null;
    resourceType: string;
    action: string;
  }>(
    kit.dbModule.complianceAuditLog,
    {
      metadata: kit.dbModule.complianceAuditLog.metadata,
      resourceType: kit.dbModule.complianceAuditLog.resourceType,
      action: kit.dbModule.complianceAuditLog.action,
    },
  );

  const matched = rows.find((row) => {
    const metadata = row.metadata;
    if (!metadata || Array.isArray(metadata)) {
      return false;
    }

    return metadata.requestId === requestId;
  });

  expect(
    matched,
    `Expected an audit event for requestId ${requestId} in community ${communityId}`,
  ).toBeDefined();
}

describeDb('WS72 phase5 security gates (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      return;
    }

    process.env.TOKEN_ENCRYPTION_KEY =
      process.env.TOKEN_ENCRYPTION_KEY
      ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    state = await initTestKit();

    const selectedCommunities = MULTI_TENANT_COMMUNITIES.filter((community) =>
      ['communityA', 'communityB', 'communityC'].includes(community.key),
    );
    await seedCommunities(state, selectedCommunities);

    const communityA = requireCommunity(state, 'communityA');
    const communityC = requireCommunity(state, 'communityC');
    const scopedA = state.dbModule.createScopedClient(communityA.id);
    const scopedC = state.dbModule.createScopedClient(communityC.id);

    const [unitA] = await scopedA.insert(state.dbModule.units, {
      unitNumber: `WS72-A-${state.runSuffix}`,
      building: 'A',
      floor: 1,
    });
    const [unitC] = await scopedC.insert(state.dbModule.units, {
      unitNumber: `WS72-C-${state.runSuffix}`,
      building: 'C',
      floor: 3,
    });

    unitAId = readNumberField(unitA, 'id');
    unitCId = readNumberField(unitC, 'id');

    const neededUsers: MultiTenantUserKey[] = [
      'actorA',
      'actorB',
      'actorC',
      'residentA',
      'tenantA',
      'tenantC',
    ];

    const unitMap = new Map<MultiTenantUserKey, number>();
    unitMap.set('tenantA', unitAId);
    unitMap.set('tenantC', unitCId);

    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((user) => neededUsers.includes(user.key)),
      unitMap,
    );

    routes = {
      assessments: await import('../../src/app/api/v1/assessments/route'),
      ledger: await import('../../src/app/api/v1/ledger/route'),
      violations: await import('../../src/app/api/v1/violations/route'),
      violationDetail: await import('../../src/app/api/v1/violations/[id]/route'),
      arc: await import('../../src/app/api/v1/arc/route'),
      arcDetail: await import('../../src/app/api/v1/arc/[id]/route'),
      polls: await import('../../src/app/api/v1/polls/route'),
      pollResults: await import('../../src/app/api/v1/polls/[id]/results/route'),
      vendors: await import('../../src/app/api/v1/vendors/route'),
      workOrders: await import('../../src/app/api/v1/work-orders/route'),
      workOrderDetail: await import('../../src/app/api/v1/work-orders/[id]/route'),
      amenities: await import('../../src/app/api/v1/amenities/route'),
      amenitySchedule: await import('../../src/app/api/v1/amenities/[id]/schedule/route'),
      packages: await import('../../src/app/api/v1/packages/route'),
      visitors: await import('../../src/app/api/v1/visitors/route'),
      googleConnect: await import('../../src/app/api/v1/calendar/google/connect/route'),
      googleCallback: await import('../../src/app/api/v1/calendar/google/callback/route'),
      googleSync: await import('../../src/app/api/v1/calendar/google/sync/route'),
      accountingConnect: await import('../../src/app/api/v1/accounting/connect/route'),
      accountingCallback: await import('../../src/app/api/v1/accounting/callback/route'),
      accountingMapping: await import('../../src/app/api/v1/accounting/mapping/route'),
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

  it('enforces permission boundaries across all Phase 5 RBAC resources', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityC = requireCommunity(kit, 'communityC');

    setActor(kit, 'residentA');
    const financeDenied = await routeModules.assessments.POST(
      jsonRequest(apiUrl('/api/v1/assessments'), 'POST', {
        communityId: communityA.id,
        title: 'Denied Assessment',
        amountCents: 10000,
        frequency: 'monthly',
        dueDay: 5,
      }),
    );
    expect(financeDenied.status).toBe(403);

    setActor(kit, 'actorC');
    const violationsDenied = await routeModules.violations.GET(
      new NextRequest(apiUrl(`/api/v1/violations?communityId=${communityC.id}`)),
    );
    expect(violationsDenied.status).toBe(403);

    setActor(kit, 'residentA');
    const arcDenied = await routeModules.arc.POST(
      jsonRequest(apiUrl('/api/v1/arc'), 'POST', {
        communityId: communityA.id,
        unitId: unitAId,
        title: 'Board Member ARC Submit',
        description: 'Should be rejected',
        projectType: 'paint',
      }),
    );
    expect(arcDenied.status).toBe(403);

    setActor(kit, 'tenantA');
    const pollsDenied = await routeModules.polls.POST(
      jsonRequest(apiUrl('/api/v1/polls'), 'POST', {
        communityId: communityA.id,
        title: 'Tenant Poll Attempt',
        description: 'Should be rejected',
        pollType: 'single_choice',
        options: ['A', 'B'],
      }),
    );
    expect(pollsDenied.status).toBe(403);

    const workOrdersDenied = await routeModules.workOrders.POST(
      jsonRequest(apiUrl('/api/v1/work-orders'), 'POST', {
        communityId: communityA.id,
        title: 'Tenant Work Order Attempt',
        description: 'Should be rejected',
        unitId: unitAId,
      }),
    );
    expect(workOrdersDenied.status).toBe(403);

    setActor(kit, 'residentA');
    const amenitiesDenied = await routeModules.amenities.POST(
      jsonRequest(apiUrl('/api/v1/amenities'), 'POST', {
        communityId: communityA.id,
        name: 'Board Member Amenity Attempt',
      }),
    );
    expect(amenitiesDenied.status).toBe(403);

    setActor(kit, 'tenantA');
    const packagesDenied = await routeModules.packages.POST(
      jsonRequest(apiUrl('/api/v1/packages'), 'POST', {
        communityId: communityA.id,
        unitId: unitAId,
        recipientName: 'Tenant A',
        carrier: 'UPS',
      }),
    );
    expect(packagesDenied.status).toBe(403);

    setActor(kit, 'residentA');
    const visitorsDenied = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: 'Guest',
        purpose: 'Visit',
        hostUnitId: unitAId,
        expectedArrival: '2026-08-01T12:00:00.000Z',
      }),
    );
    expect(visitorsDenied.status).toBe(403);

    const calendarDenied = await routeModules.googleConnect.POST(
      jsonRequest(apiUrl('/api/v1/calendar/google/connect'), 'POST', {
        communityId: communityA.id,
      }),
    );
    expect(calendarDenied.status).toBe(403);

    setActor(kit, 'actorA');
    const accountingDenied = await routeModules.accountingConnect.POST(
      jsonRequest(apiUrl('/api/v1/accounting/connect'), 'POST', {
        communityId: communityA.id,
        provider: 'quickbooks',
      }),
    );
    expect(accountingDenied.status).toBe(403);
  });

  it('enforces cross-tenant isolation across WS66-WS71 resource surfaces', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityB = requireCommunity(kit, 'communityB');
    const communityC = requireCommunity(kit, 'communityC');

    setActor(kit, 'tenantA');
    const violationCreate = await routeModules.violations.POST(
      jsonRequest(apiUrl('/api/v1/violations'), 'POST', {
        communityId: communityA.id,
        unitId: unitAId,
        category: 'parking',
        description: `Cross-tenant violation ${kit.runSuffix}`,
      }),
    );
    expect(violationCreate.status).toBe(201);
    const violationJson = await parseJson<{ data: Record<string, unknown> }>(violationCreate);
    const violationId = readNumberField(violationJson.data, 'id');

    const arcCreate = await routeModules.arc.POST(
      jsonRequest(apiUrl('/api/v1/arc'), 'POST', {
        communityId: communityA.id,
        unitId: unitAId,
        title: `Cross-tenant ARC ${kit.runSuffix}`,
        description: 'Cross-tenant ARC seed',
        projectType: 'landscaping',
      }),
    );
    expect(arcCreate.status).toBe(201);
    const arcJson = await parseJson<{ data: Record<string, unknown> }>(arcCreate);
    const arcId = readNumberField(arcJson.data, 'id');

    setActor(kit, 'residentA');
    const pollCreate = await routeModules.polls.POST(
      jsonRequest(apiUrl('/api/v1/polls'), 'POST', {
        communityId: communityA.id,
        title: `Cross-tenant Poll ${kit.runSuffix}`,
        description: 'Cross-tenant poll seed',
        pollType: 'single_choice',
        options: ['Yes', 'No'],
      }),
    );
    expect(pollCreate.status).toBe(201);
    const pollJson = await parseJson<{ data: Record<string, unknown> }>(pollCreate);
    const pollId = readNumberField(pollJson.data, 'id');

    setActor(kit, 'actorA');
    const vendorCreate = await routeModules.vendors.POST(
      jsonRequest(apiUrl('/api/v1/vendors'), 'POST', {
        communityId: communityA.id,
        name: `Vendor ${kit.runSuffix}`,
        company: 'Cross Tenant Services',
      }),
    );
    expect(vendorCreate.status).toBe(201);
    const vendorJson = await parseJson<{ data: Record<string, unknown> }>(vendorCreate);
    const vendorId = readNumberField(vendorJson.data, 'id');

    const workOrderCreate = await routeModules.workOrders.POST(
      jsonRequest(apiUrl('/api/v1/work-orders'), 'POST', {
        communityId: communityA.id,
        title: `Cross-tenant Work Order ${kit.runSuffix}`,
        description: 'Cross-tenant work order seed',
        unitId: unitAId,
        vendorId,
      }),
    );
    expect(workOrderCreate.status).toBe(201);
    const workOrderJson = await parseJson<{ data: Record<string, unknown> }>(workOrderCreate);
    const workOrderId = readNumberField(workOrderJson.data, 'id');

    const amenityCreate = await routeModules.amenities.POST(
      jsonRequest(apiUrl('/api/v1/amenities'), 'POST', {
        communityId: communityA.id,
        name: `WS72 Amenity ${kit.runSuffix}`,
      }),
    );
    expect(amenityCreate.status).toBe(201);
    const amenityJson = await parseJson<{ data: Record<string, unknown> }>(amenityCreate);
    const amenityId = readNumberField(amenityJson.data, 'id');

    const packageCreate = await routeModules.packages.POST(
      jsonRequest(apiUrl('/api/v1/packages'), 'POST', {
        communityId: communityA.id,
        unitId: unitAId,
        recipientName: `Tenant A ${kit.runSuffix}`,
        carrier: 'FedEx',
      }),
    );
    expect(packageCreate.status).toBe(201);

    setActor(kit, 'tenantA');
    const visitorCreate = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Guest ${kit.runSuffix}`,
        purpose: 'Cross-tenant seed',
        hostUnitId: unitAId,
        expectedArrival: '2026-08-02T12:00:00.000Z',
      }),
    );
    expect(visitorCreate.status).toBe(201);

    setActor(kit, 'actorA');
    const calendarConnect = await routeModules.googleConnect.POST(
      jsonRequest(apiUrl('/api/v1/calendar/google/connect'), 'POST', {
        communityId: communityA.id,
      }),
    );
    expect(calendarConnect.status).toBe(200);

    setActor(kit, 'actorC');
    const accountingConnect = await routeModules.accountingConnect.POST(
      jsonRequest(apiUrl('/api/v1/accounting/connect'), 'POST', {
        communityId: communityC.id,
        provider: 'quickbooks',
      }),
    );
    expect(accountingConnect.status).toBe(200);

    setActor(kit, 'actorB');

    const financeCrossTenant = await routeModules.ledger.GET(
      new NextRequest(apiUrl(`/api/v1/ledger?communityId=${communityA.id}`)),
    );
    expect(financeCrossTenant.status).toBe(403);

    const violationsCrossTenant = await routeModules.violationDetail.GET(
      new NextRequest(apiUrl(`/api/v1/violations/${violationId}?communityId=${communityB.id}`)),
      { params: Promise.resolve({ id: String(violationId) }) },
    );
    expect([403, 404]).toContain(violationsCrossTenant.status);

    const arcCrossTenant = await routeModules.arcDetail.GET(
      new NextRequest(apiUrl(`/api/v1/arc/${arcId}?communityId=${communityB.id}`)),
      { params: Promise.resolve({ id: String(arcId) }) },
    );
    expect([403, 404]).toContain(arcCrossTenant.status);

    const pollsCrossTenant = await routeModules.pollResults.GET(
      new NextRequest(apiUrl(`/api/v1/polls/${pollId}/results?communityId=${communityB.id}`)),
      { params: Promise.resolve({ id: String(pollId) }) },
    );
    expect([403, 404]).toContain(pollsCrossTenant.status);

    const workOrdersCrossTenant = await routeModules.workOrderDetail.GET(
      new NextRequest(apiUrl(`/api/v1/work-orders/${workOrderId}?communityId=${communityB.id}`)),
      { params: Promise.resolve({ id: String(workOrderId) }) },
    );
    expect([403, 404]).toContain(workOrdersCrossTenant.status);

    const amenitiesCrossTenant = await routeModules.amenitySchedule.GET(
      new NextRequest(apiUrl(`/api/v1/amenities/${amenityId}/schedule?communityId=${communityB.id}`)),
      { params: Promise.resolve({ id: String(amenityId) }) },
    );
    expect([403, 404]).toContain(amenitiesCrossTenant.status);

    const packagesCrossTenant = await routeModules.packages.GET(
      new NextRequest(apiUrl(`/api/v1/packages?communityId=${communityA.id}`)),
    );
    expect(packagesCrossTenant.status).toBe(403);

    const visitorsCrossTenant = await routeModules.visitors.GET(
      new NextRequest(apiUrl(`/api/v1/visitors?communityId=${communityA.id}`)),
    );
    expect(visitorsCrossTenant.status).toBe(403);

    const calendarCrossTenant = await routeModules.googleSync.POST(
      jsonRequest(apiUrl('/api/v1/calendar/google/sync'), 'POST', {
        communityId: communityA.id,
      }),
    );
    expect(calendarCrossTenant.status).toBe(403);

    const accountingCrossTenant = await routeModules.accountingMapping.GET(
      new NextRequest(apiUrl(`/api/v1/accounting/mapping?communityId=${communityC.id}&provider=quickbooks`)),
    );
    expect(accountingCrossTenant.status).toBe(403);
  });

  it('enforces Phase 5 feature flags for disabled community types', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityB = requireCommunity(kit, 'communityB');
    const communityC = requireCommunity(kit, 'communityC');

    setActor(kit, 'actorC');
    const apartmentViolations = await routeModules.violations.GET(
      new NextRequest(apiUrl(`/api/v1/violations?communityId=${communityC.id}`)),
    );
    expect(apartmentViolations.status).toBe(403);
    const apartmentViolationsBody = await parseJson<{ error: { message: string } }>(apartmentViolations);
    expect(apartmentViolationsBody.error.message).toMatch(/not enabled/i);

    const apartmentArc = await routeModules.arc.GET(
      new NextRequest(apiUrl(`/api/v1/arc?communityId=${communityC.id}`)),
    );
    expect(apartmentArc.status).toBe(403);
    const apartmentArcBody = await parseJson<{ error: { message: string } }>(apartmentArc);
    expect(apartmentArcBody.error.message).toMatch(/not enabled/i);

    setActor(kit, 'actorB');
    const hoaPackages = await routeModules.packages.POST(
      jsonRequest(apiUrl('/api/v1/packages'), 'POST', {
        communityId: communityB.id,
        unitId: unitAId,
        recipientName: 'HOA Recipient',
        carrier: 'UPS',
      }),
    );
    expect(hoaPackages.status).toBe(403);
    const hoaPackagesBody = await parseJson<{ error: { message: string } }>(hoaPackages);
    expect(hoaPackagesBody.error.message).toMatch(/not enabled/i);

    const hoaVisitors = await routeModules.visitors.GET(
      new NextRequest(apiUrl(`/api/v1/visitors?communityId=${communityB.id}`)),
    );
    expect(hoaVisitors.status).toBe(403);
    const hoaVisitorsBody = await parseJson<{ error: { message: string } }>(hoaVisitors);
    expect(hoaVisitorsBody.error.message).toMatch(/not enabled/i);
  });

  it('rejects Phase 5 tenant-scoped routes when community context is missing', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    setActor(kit, 'actorA');

    const missingContextResponse = await routeModules.assessments.GET(
      new NextRequest(apiUrl('/api/v1/assessments')),
    );
    expect(missingContextResponse.status).toBe(400);
    const missingContextBody = await parseJson<{ error: { message: string } }>(missingContextResponse);
    expect(missingContextBody.error.message).toMatch(/communityId/i);
  });

  it('records audit events for Phase 5 mutation flows with request-id correlation', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityC = requireCommunity(kit, 'communityC');

    setActor(kit, 'actorA');
    const financeRequestId = randomUUID();
    const financeMutation = await routeModules.assessments.POST(
      jsonRequest(
        apiUrl('/api/v1/assessments'),
        'POST',
        {
          communityId: communityA.id,
          title: `Audit Assessment ${kit.runSuffix}`,
          amountCents: 12000,
          frequency: 'monthly',
          dueDay: 8,
        },
        { 'x-request-id': financeRequestId },
      ),
    );
    expect(financeMutation.status).toBe(201);
    await expectAuditEventForRequestId(kit, communityA.id, financeRequestId);

    setActor(kit, 'tenantA');
    const violationsRequestId = randomUUID();
    const violationsMutation = await routeModules.violations.POST(
      jsonRequest(
        apiUrl('/api/v1/violations'),
        'POST',
        {
          communityId: communityA.id,
          unitId: unitAId,
          category: 'noise',
          description: `Audit violation ${kit.runSuffix}`,
        },
        { 'x-request-id': violationsRequestId },
      ),
    );
    expect(violationsMutation.status).toBe(201);
    await expectAuditEventForRequestId(kit, communityA.id, violationsRequestId);

    const arcRequestId = randomUUID();
    const arcMutation = await routeModules.arc.POST(
      jsonRequest(
        apiUrl('/api/v1/arc'),
        'POST',
        {
          communityId: communityA.id,
          unitId: unitAId,
          title: `Audit ARC ${kit.runSuffix}`,
          description: 'Audit ARC flow',
          projectType: 'fencing',
        },
        { 'x-request-id': arcRequestId },
      ),
    );
    expect(arcMutation.status).toBe(201);
    await expectAuditEventForRequestId(kit, communityA.id, arcRequestId);

    setActor(kit, 'residentA');
    const pollsRequestId = randomUUID();
    const pollsMutation = await routeModules.polls.POST(
      jsonRequest(
        apiUrl('/api/v1/polls'),
        'POST',
        {
          communityId: communityA.id,
          title: `Audit Poll ${kit.runSuffix}`,
          description: 'Audit poll flow',
          pollType: 'single_choice',
          options: ['Approve', 'Reject'],
        },
        { 'x-request-id': pollsRequestId },
      ),
    );
    expect(pollsMutation.status).toBe(201);
    await expectAuditEventForRequestId(kit, communityA.id, pollsRequestId);

    setActor(kit, 'actorA');
    const workOrdersRequestId = randomUUID();
    const workOrdersMutation = await routeModules.vendors.POST(
      jsonRequest(
        apiUrl('/api/v1/vendors'),
        'POST',
        {
          communityId: communityA.id,
          name: `Audit Vendor ${kit.runSuffix}`,
          company: 'Audit Services Inc.',
        },
        { 'x-request-id': workOrdersRequestId },
      ),
    );
    expect(workOrdersMutation.status).toBe(201);
    await expectAuditEventForRequestId(kit, communityA.id, workOrdersRequestId);

    const amenitiesRequestId = randomUUID();
    const amenitiesMutation = await routeModules.amenities.POST(
      jsonRequest(
        apiUrl('/api/v1/amenities'),
        'POST',
        {
          communityId: communityA.id,
          name: `Audit Amenity ${kit.runSuffix}`,
        },
        { 'x-request-id': amenitiesRequestId },
      ),
    );
    expect(amenitiesMutation.status).toBe(201);
    await expectAuditEventForRequestId(kit, communityA.id, amenitiesRequestId);

    const packagesRequestId = randomUUID();
    const packagesMutation = await routeModules.packages.POST(
      jsonRequest(
        apiUrl('/api/v1/packages'),
        'POST',
        {
          communityId: communityA.id,
          unitId: unitAId,
          recipientName: `Audit Resident ${kit.runSuffix}`,
          carrier: 'USPS',
        },
        { 'x-request-id': packagesRequestId },
      ),
    );
    expect(packagesMutation.status).toBe(201);
    await expectAuditEventForRequestId(kit, communityA.id, packagesRequestId);

    setActor(kit, 'tenantA');
    const visitorsRequestId = randomUUID();
    const visitorsMutation = await routeModules.visitors.POST(
      jsonRequest(
        apiUrl('/api/v1/visitors'),
        'POST',
        {
          communityId: communityA.id,
          visitorName: `Audit Visitor ${kit.runSuffix}`,
          purpose: 'Audit flow',
          hostUnitId: unitAId,
          expectedArrival: '2026-09-01T18:00:00.000Z',
        },
        { 'x-request-id': visitorsRequestId },
      ),
    );
    expect(visitorsMutation.status).toBe(201);
    await expectAuditEventForRequestId(kit, communityA.id, visitorsRequestId);

    setActor(kit, 'actorA');
    const calendarRequestId = randomUUID();
    const calendarMutation = await routeModules.googleCallback.GET(
      new NextRequest(
        apiUrl(`/api/v1/calendar/google/callback?communityId=${communityA.id}&code=ws72-calendar-code`),
        {
          headers: {
            'x-request-id': calendarRequestId,
          },
        },
      ),
    );
    expect(calendarMutation.status).toBe(200);
    await expectAuditEventForRequestId(kit, communityA.id, calendarRequestId);

    setActor(kit, 'actorC');
    const accountingRequestId = randomUUID();
    const accountingMutation = await routeModules.accountingCallback.GET(
      new NextRequest(
        apiUrl(
          `/api/v1/accounting/callback?communityId=${communityC.id}&provider=quickbooks&code=ws72-accounting-code`,
        ),
        {
          headers: {
            'x-request-id': accountingRequestId,
          },
        },
      ),
    );
    expect(accountingMutation.status).toBe(200);
    await expectAuditEventForRequestId(kit, communityC.id, accountingRequestId);
  });
});
