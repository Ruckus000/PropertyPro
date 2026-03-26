import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from '@propertypro/db/filters';
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
  setActorById,
  teardownTestKit,
  trackUserForCleanup,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('WS66 finance/dues/ledger integration tests');

const describeDb = getDescribeDb();

type AssessmentsRouteModule = typeof import('../../src/app/api/v1/assessments/route');
type AssessmentGenerateRouteModule = typeof import('../../src/app/api/v1/assessments/[id]/generate/route');
type AssessmentLineItemsRouteModule = typeof import('../../src/app/api/v1/assessments/[id]/line-items/route');
type DelinquencyRouteModule = typeof import('../../src/app/api/v1/delinquency/route');
type DelinquencyWaiveRouteModule = typeof import('../../src/app/api/v1/delinquency/[unitId]/waive/route');
type PaymentCreateIntentRouteModule = typeof import('../../src/app/api/v1/payments/create-intent/route');
type PaymentHistoryRouteModule = typeof import('../../src/app/api/v1/payments/history/route');
type PaymentStatementRouteModule = typeof import('../../src/app/api/v1/payments/statement/route');
type LedgerRouteModule = typeof import('../../src/app/api/v1/ledger/route');
type LedgerBalanceRouteModule = typeof import('../../src/app/api/v1/ledger/balance/[unitId]/route');
type FinanceExportCsvRouteModule = typeof import('../../src/app/api/v1/finance/export/csv/route');
type FinanceExportStatementRouteModule = typeof import('../../src/app/api/v1/finance/export/statement/route');
type StripeConnectStatusRouteModule = typeof import('../../src/app/api/v1/stripe/connect/status/route');

interface RouteModules {
  assessments: AssessmentsRouteModule;
  assessmentGenerate: AssessmentGenerateRouteModule;
  assessmentLineItems: AssessmentLineItemsRouteModule;
  delinquency: DelinquencyRouteModule;
  delinquencyWaive: DelinquencyWaiveRouteModule;
  paymentCreateIntent: PaymentCreateIntentRouteModule;
  paymentHistory: PaymentHistoryRouteModule;
  paymentStatement: PaymentStatementRouteModule;
  ledger: LedgerRouteModule;
  ledgerBalance: LedgerBalanceRouteModule;
  financeExportCsv: FinanceExportCsvRouteModule;
  financeExportStatement: FinanceExportStatementRouteModule;
  stripeConnectStatus: StripeConnectStatusRouteModule;
}

let state: TestKitState | null = null;
let routes: RouteModules | null = null;
let unitAId: number;
let unitASecondaryId: number;
let unitCId: number;
let ownerAUserId: string;

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function requireRoutes(): RouteModules {
  if (!routes) throw new Error('Route modules not loaded');
  return routes;
}

describeDb('WS66 finance/dues/ledger (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();
    const communityA = MULTI_TENANT_COMMUNITIES.find((item) => item.key === 'communityA');
    const communityC = MULTI_TENANT_COMMUNITIES.find((item) => item.key === 'communityC');
    if (!communityA || !communityC) {
      throw new Error('Required community fixtures not found');
    }
    await seedCommunities(state, [communityA, communityC]);

    const neededUsers: MultiTenantUserKey[] = ['actorA', 'actorC', 'tenantA', 'tenantC'];
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((user) => neededUsers.includes(user.key)),
    );

    const seededCommunityA = requireCommunity(state, 'communityA');
    const seededCommunityC = requireCommunity(state, 'communityC');
    const scopedA = state.dbModule.createScopedClient(seededCommunityA.id);
    const scopedC = state.dbModule.createScopedClient(seededCommunityC.id);

    const [unitA] = await scopedA.insert(state.dbModule.units, {
      unitNumber: `FIN-A-${state.runSuffix}`,
      building: 'A',
      floor: 1,
    });
    const [unitASecondary] = await scopedA.insert(state.dbModule.units, {
      unitNumber: `FIN-A2-${state.runSuffix}`,
      building: 'A',
      floor: 2,
    });
    const [unitC] = await scopedC.insert(state.dbModule.units, {
      unitNumber: `FIN-C-${state.runSuffix}`,
      building: 'C',
      floor: 2,
    });

    unitAId = readNumberField(unitA, 'id');
    unitASecondaryId = readNumberField(unitASecondary, 'id');
    unitCId = readNumberField(unitC, 'id');

    ownerAUserId = randomUUID();
    await state.db.insert(state.dbModule.users).values({
      id: ownerAUserId,
      email: `owner-a+${state.runSuffix}@example.com`,
      fullName: `Owner A ${state.runSuffix}`,
      phone: null,
    });
    await scopedA.update(
      state.dbModule.units,
      {
        ownerUserId: ownerAUserId,
      },
      eq(state.dbModule.units.id, unitAId),
    );
    await scopedA.insert(state.dbModule.userRoles, {
      userId: ownerAUserId,
      role: 'resident',
      isUnitOwner: true,
      displayTitle: 'Owner',
      unitId: null,
    });
    trackUserForCleanup(state, ownerAUserId);

    routes = {
      assessments: await import('../../src/app/api/v1/assessments/route'),
      assessmentGenerate: await import('../../src/app/api/v1/assessments/[id]/generate/route'),
      assessmentLineItems: await import('../../src/app/api/v1/assessments/[id]/line-items/route'),
      delinquency: await import('../../src/app/api/v1/delinquency/route'),
      delinquencyWaive: await import('../../src/app/api/v1/delinquency/[unitId]/waive/route'),
      paymentCreateIntent: await import('../../src/app/api/v1/payments/create-intent/route'),
      paymentHistory: await import('../../src/app/api/v1/payments/history/route'),
      paymentStatement: await import('../../src/app/api/v1/payments/statement/route'),
      ledger: await import('../../src/app/api/v1/ledger/route'),
      ledgerBalance: await import('../../src/app/api/v1/ledger/balance/[unitId]/route'),
      financeExportCsv: await import('../../src/app/api/v1/finance/export/csv/route'),
      financeExportStatement: await import('../../src/app/api/v1/finance/export/statement/route'),
      stripeConnectStatus: await import('../../src/app/api/v1/stripe/connect/status/route'),
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

  it('runs assessment -> line items -> ledger -> delinquency -> export flow', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    const createResponse = await routeModules.assessments.POST(
      jsonRequest(apiUrl('/api/v1/assessments'), 'POST', {
        communityId: communityA.id,
        title: `Monthly Dues ${kit.runSuffix}`,
        description: 'Integration dues test',
        amountCents: 25000,
        frequency: 'monthly',
        dueDay: 10,
        lateFeeAmountCents: 500,
        lateFeeDaysGrace: 5,
        startDate: '2026-01-01',
        isActive: true,
      }),
    );
    expect(createResponse.status).toBe(201);
    const createJson = await parseJson<{ data: Record<string, unknown> }>(createResponse);
    const assessmentId = readNumberField(createJson.data, 'id');

    const generateResponse = await routeModules.assessmentGenerate.POST(
      jsonRequest(apiUrl(`/api/v1/assessments/${assessmentId}/generate`), 'POST', {
        communityId: communityA.id,
        dueDate: '2026-01-15',
      }),
      { params: Promise.resolve({ id: String(assessmentId) }) },
    );
    expect(generateResponse.status).toBe(200);
    const generateJson = await parseJson<{ data: Record<string, unknown> }>(generateResponse);
    expect(generateJson.data['insertedCount']).toBeGreaterThan(0);

    const lineItemsResponse = await routeModules.assessmentLineItems.GET(
      new NextRequest(apiUrl(`/api/v1/assessments/${assessmentId}/line-items?communityId=${communityA.id}`)),
      { params: Promise.resolve({ id: String(assessmentId) }) },
    );
    expect(lineItemsResponse.status).toBe(200);
    const lineItemsJson = await parseJson<{ data: Array<Record<string, unknown>> }>(lineItemsResponse);
    expect(lineItemsJson.data.length).toBeGreaterThan(0);
    // Pick the line item belonging to unitAId so the waive test later targets the correct unit
    const unitALineItem = lineItemsJson.data.find((row) => row['unitId'] === unitAId) ?? lineItemsJson.data[0]!;
    const lineItemId = readNumberField(unitALineItem, 'id');

    const ledgerResponse = await routeModules.ledger.GET(
      new NextRequest(apiUrl(`/api/v1/ledger?communityId=${communityA.id}&entryType=assessment`)),
    );
    expect(ledgerResponse.status).toBe(200);
    const ledgerJson = await parseJson<{ data: Array<Record<string, unknown>> }>(ledgerResponse);
    expect(
      ledgerJson.data.some((row) => row['sourceId'] === String(lineItemId)),
    ).toBe(true);

    const scopedA = kit.dbModule.createScopedClient(communityA.id);
    await scopedA.update(
      kit.dbModule.assessmentLineItems,
      {
        lateFeeCents: 500,
      },
      eq(kit.dbModule.assessmentLineItems.id, lineItemId),
    );

    const delinquencyResponse = await routeModules.delinquency.GET(
      new NextRequest(apiUrl(`/api/v1/delinquency?communityId=${communityA.id}`)),
    );
    expect(delinquencyResponse.status).toBe(200);
    const delinquencyJson = await parseJson<{ data: Array<Record<string, unknown>> }>(delinquencyResponse);
    expect(delinquencyJson.data.some((row) => row['unitId'] === unitAId)).toBe(true);

    const waiveResponse = await routeModules.delinquencyWaive.POST(
      jsonRequest(apiUrl(`/api/v1/delinquency/${unitAId}/waive`), 'POST', {
        communityId: communityA.id,
      }),
      { params: Promise.resolve({ unitId: String(unitAId) }) },
    );
    expect(waiveResponse.status).toBe(200);
    const waiveJson = await parseJson<{ data: Record<string, unknown> }>(waiveResponse);
    expect(waiveJson.data['waivedCount']).toBeGreaterThan(0);
    expect(waiveJson.data['waivedAmountCents']).toBeGreaterThan(0);

    const balanceResponse = await routeModules.ledgerBalance.GET(
      new NextRequest(apiUrl(`/api/v1/ledger/balance/${unitAId}?communityId=${communityA.id}`)),
      { params: Promise.resolve({ unitId: String(unitAId) }) },
    );
    expect(balanceResponse.status).toBe(200);
    const balanceJson = await parseJson<{ data: Record<string, unknown> }>(balanceResponse);
    expect(balanceJson.data['unitId']).toBe(unitAId);
    expect(typeof balanceJson.data['balanceCents']).toBe('number');

    const csvResponse = await routeModules.financeExportCsv.GET(
      new NextRequest(apiUrl(`/api/v1/finance/export/csv?communityId=${communityA.id}&unitId=${unitAId}`)),
    );
    expect(csvResponse.status).toBe(200);
    expect(csvResponse.headers.get('content-type')).toContain('text/csv');
    const csvBody = await csvResponse.text();
    expect(csvBody).toContain('Entry ID');
    expect(csvBody).toContain('assessment');
  });

  it('enforces owner-only unit scoping across owner-facing WS66 routes', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const scopedA = kit.dbModule.createScopedClient(communityA.id);
    setActorById(kit, ownerAUserId);

    const [assessment] = await scopedA.insert(kit.dbModule.assessments, {
      title: `Owner Scope Assessment ${kit.runSuffix}`,
      description: null,
      amountCents: 15000,
      frequency: 'monthly',
      dueDay: 5,
      lateFeeAmountCents: 0,
      lateFeeDaysGrace: 0,
      startDate: '2026-01-01',
      endDate: null,
      isActive: true,
    });
    const assessmentId = readNumberField(assessment, 'id');

    const [ownerLineItem] = await scopedA.insert(kit.dbModule.assessmentLineItems, {
      assessmentId,
      unitId: unitAId,
      amountCents: 15000,
      dueDate: '2026-01-15',
      status: 'paid',
      paidAt: new Date('2026-01-16T00:00:00.000Z'),
      lateFeeCents: 0,
      paymentIntentId: `pi_owner_${kit.runSuffix}`,
    });
    const [otherUnitLineItem] = await scopedA.insert(kit.dbModule.assessmentLineItems, {
      assessmentId,
      unitId: unitASecondaryId,
      amountCents: 18000,
      dueDate: '2026-01-15',
      status: 'paid',
      paidAt: new Date('2026-01-16T00:00:00.000Z'),
      lateFeeCents: 0,
      paymentIntentId: `pi_other_${kit.runSuffix}`,
    });

    await scopedA.insert(kit.dbModule.ledgerEntries, {
      entryType: 'assessment',
      amountCents: 15000,
      description: 'Owner-scoped assessment',
      sourceType: 'assessment',
      sourceId: `owner-line-${readNumberField(ownerLineItem, 'id')}`,
      unitId: unitAId,
      userId: ownerAUserId,
      effectiveDate: '2026-01-15',
      createdByUserId: ownerAUserId,
      metadata: {},
    });
    await scopedA.insert(kit.dbModule.ledgerEntries, {
      entryType: 'assessment',
      amountCents: 18000,
      description: 'Other-unit assessment',
      sourceType: 'assessment',
      sourceId: `other-unit-${kit.runSuffix}`,
      unitId: unitASecondaryId,
      userId: ownerAUserId,
      effectiveDate: '2026-01-15',
      createdByUserId: ownerAUserId,
      metadata: {},
    });

    const lineItemsForbidden = await routeModules.assessmentLineItems.GET(
      new NextRequest(
        apiUrl(`/api/v1/assessments/${assessmentId}/line-items?communityId=${communityA.id}&unitId=${unitASecondaryId}`),
      ),
      { params: Promise.resolve({ id: String(assessmentId) }) },
    );
    expect(lineItemsForbidden.status).toBe(403);

    const lineItemsResponse = await routeModules.assessmentLineItems.GET(
      new NextRequest(
        apiUrl(`/api/v1/assessments/${assessmentId}/line-items?communityId=${communityA.id}`),
      ),
      { params: Promise.resolve({ id: String(assessmentId) }) },
    );
    expect(lineItemsResponse.status).toBe(200);
    const lineItemsJson = await parseJson<{ data: Array<Record<string, unknown>> }>(lineItemsResponse);
    expect(lineItemsJson.data).not.toHaveLength(0);
    expect(lineItemsJson.data.every((row) => row['unitId'] === unitAId)).toBe(true);

    const historyForbidden = await routeModules.paymentHistory.GET(
      new NextRequest(apiUrl(`/api/v1/payments/history?communityId=${communityA.id}&unitId=${unitASecondaryId}`)),
    );
    expect(historyForbidden.status).toBe(403);

    const historyResponse = await routeModules.paymentHistory.GET(
      new NextRequest(apiUrl(`/api/v1/payments/history?communityId=${communityA.id}`)),
    );
    expect(historyResponse.status).toBe(200);
    const historyJson = await parseJson<{ data: Array<Record<string, unknown>> }>(historyResponse);
    expect(historyJson.data).not.toHaveLength(0);
    expect(historyJson.data.every((row) => row['unitId'] === unitAId)).toBe(true);

    const statementForbidden = await routeModules.paymentStatement.GET(
      new NextRequest(apiUrl(`/api/v1/payments/statement?communityId=${communityA.id}&unitId=${unitASecondaryId}`)),
    );
    expect(statementForbidden.status).toBe(403);

    const statementResponse = await routeModules.paymentStatement.GET(
      new NextRequest(apiUrl(`/api/v1/payments/statement?communityId=${communityA.id}`)),
    );
    expect(statementResponse.status).toBe(200);
    const statementJson = await parseJson<{ data: Record<string, unknown> }>(statementResponse);
    expect(statementJson.data['unitId']).toBe(unitAId);

    const ledgerForbidden = await routeModules.ledger.GET(
      new NextRequest(apiUrl(`/api/v1/ledger?communityId=${communityA.id}&unitId=${unitASecondaryId}`)),
    );
    expect(ledgerForbidden.status).toBe(403);

    const balanceForbidden = await routeModules.ledgerBalance.GET(
      new NextRequest(apiUrl(`/api/v1/ledger/balance/${unitASecondaryId}?communityId=${communityA.id}`)),
      { params: Promise.resolve({ unitId: String(unitASecondaryId) }) },
    );
    expect(balanceForbidden.status).toBe(403);

    const exportCsvForbidden = await routeModules.financeExportCsv.GET(
      new NextRequest(apiUrl(`/api/v1/finance/export/csv?communityId=${communityA.id}&unitId=${unitASecondaryId}`)),
    );
    expect(exportCsvForbidden.status).toBe(403);

    const exportPdfForbidden = await routeModules.financeExportStatement.GET(
      new NextRequest(apiUrl(`/api/v1/finance/export/statement?communityId=${communityA.id}&unitId=${unitASecondaryId}`)),
    );
    expect(exportPdfForbidden.status).toBe(403);

    const paymentIntentForbidden = await routeModules.paymentCreateIntent.POST(
      jsonRequest(apiUrl('/api/v1/payments/create-intent'), 'POST', {
        communityId: communityA.id,
        lineItemId: readNumberField(otherUnitLineItem, 'id'),
      }),
    );
    expect(paymentIntentForbidden.status).toBe(403);
  });

  it('requires explicit unitId for multi-unit owner shared finance endpoints', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const scopedA = kit.dbModule.createScopedClient(communityA.id);

    setActorById(kit, ownerAUserId);
    await scopedA.update(
      kit.dbModule.units,
      {
        ownerUserId: ownerAUserId,
      },
      eq(kit.dbModule.units.id, unitASecondaryId),
    );

    const historyResponse = await routeModules.paymentHistory.GET(
      new NextRequest(apiUrl(`/api/v1/payments/history?communityId=${communityA.id}`)),
    );
    expect(historyResponse.status).toBe(400);

    const statementResponse = await routeModules.paymentStatement.GET(
      new NextRequest(apiUrl(`/api/v1/payments/statement?communityId=${communityA.id}`)),
    );
    expect(statementResponse.status).toBe(400);

    const ledgerResponse = await routeModules.ledger.GET(
      new NextRequest(apiUrl(`/api/v1/ledger?communityId=${communityA.id}`)),
    );
    expect(ledgerResponse.status).toBe(400);

    const exportCsvResponse = await routeModules.financeExportCsv.GET(
      new NextRequest(apiUrl(`/api/v1/finance/export/csv?communityId=${communityA.id}`)),
    );
    expect(exportCsvResponse.status).toBe(400);

    const exportStatementResponse = await routeModules.financeExportStatement.GET(
      new NextRequest(apiUrl(`/api/v1/finance/export/statement?communityId=${communityA.id}`)),
    );
    expect(exportStatementResponse.status).toBe(400);
  });

  it('enforces cross-tenant isolation for WS66 tables and routes', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityC = requireCommunity(kit, 'communityC');

    const scopedA = kit.dbModule.createScopedClient(communityA.id);
    const scopedC = kit.dbModule.createScopedClient(communityC.id);

    const [assessmentA] = await scopedA.insert(kit.dbModule.assessments, {
      title: `Isolation Assessment ${kit.runSuffix}`,
      description: null,
      amountCents: 10000,
      frequency: 'monthly',
      dueDay: 1,
      lateFeeAmountCents: 0,
      lateFeeDaysGrace: 0,
      startDate: '2026-01-01',
      endDate: null,
      isActive: true,
    });
    const assessmentAId = readNumberField(assessmentA, 'id');

    await scopedA.insert(kit.dbModule.assessmentLineItems, {
      assessmentId: assessmentAId,
      unitId: unitAId,
      amountCents: 10000,
      dueDate: '2026-01-20',
      status: 'pending',
      lateFeeCents: 0,
    });

    await scopedA.insert(kit.dbModule.stripeConnectedAccounts, {
      stripeAccountId: `acct_${kit.runSuffix}`,
      onboardingComplete: true,
      chargesEnabled: true,
      payoutsEnabled: true,
    });

    await scopedA.insert(kit.dbModule.financeStripeWebhookEvents, {
      stripeEventId: `evt_finance_${kit.runSuffix}`,
      eventType: 'payment_intent.succeeded',
      payload: { source: 'integration' },
    });

    const crossAssessmentRows = await scopedC.selectFrom(
      kit.dbModule.assessments,
      {},
      eq(kit.dbModule.assessments.id, assessmentAId),
    );
    expect(crossAssessmentRows).toHaveLength(0);

    const crossLineItems = await scopedC.selectFrom(
      kit.dbModule.assessmentLineItems,
      {},
      eq(kit.dbModule.assessmentLineItems.unitId, unitAId),
    );
    expect(crossLineItems).toHaveLength(0);

    const crossConnectRows = await scopedC.selectFrom(
      kit.dbModule.stripeConnectedAccounts,
      {},
      eq(kit.dbModule.stripeConnectedAccounts.communityId, communityA.id),
    );
    expect(crossConnectRows).toHaveLength(0);

    const crossWebhookRows = await scopedC.selectFrom(
      kit.dbModule.financeStripeWebhookEvents,
      {},
      eq(kit.dbModule.financeStripeWebhookEvents.stripeEventId, `evt_finance_${kit.runSuffix}`),
    );
    expect(crossWebhookRows).toHaveLength(0);

    setActor(kit, 'actorC');
    const forbiddenRouteResponse = await routeModules.assessments.GET(
      new NextRequest(apiUrl(`/api/v1/assessments?communityId=${communityA.id}`)),
    );
    expect(forbiddenRouteResponse.status).toBe(403);

    const forbiddenHistoryResponse = await routeModules.paymentHistory.GET(
      new NextRequest(apiUrl(`/api/v1/payments/history?communityId=${communityA.id}`)),
    );
    expect(forbiddenHistoryResponse.status).toBe(403);

    const forbiddenStatementResponse = await routeModules.paymentStatement.GET(
      new NextRequest(apiUrl(`/api/v1/payments/statement?communityId=${communityA.id}&unitId=${unitAId}`)),
    );
    expect(forbiddenStatementResponse.status).toBe(403);

    const forbiddenCreateIntentResponse = await routeModules.paymentCreateIntent.POST(
      jsonRequest(apiUrl('/api/v1/payments/create-intent'), 'POST', {
        communityId: communityA.id,
        lineItemId: 1,
      }),
    );
    expect(forbiddenCreateIntentResponse.status).toBe(403);

    const forbiddenBalanceResponse = await routeModules.ledgerBalance.GET(
      new NextRequest(apiUrl(`/api/v1/ledger/balance/${unitAId}?communityId=${communityA.id}`)),
      { params: Promise.resolve({ unitId: String(unitAId) }) },
    );
    expect(forbiddenBalanceResponse.status).toBe(403);

    const forbiddenExportCsvResponse = await routeModules.financeExportCsv.GET(
      new NextRequest(apiUrl(`/api/v1/finance/export/csv?communityId=${communityA.id}`)),
    );
    expect(forbiddenExportCsvResponse.status).toBe(403);

    const forbiddenExportStatementResponse = await routeModules.financeExportStatement.GET(
      new NextRequest(apiUrl(`/api/v1/finance/export/statement?communityId=${communityA.id}&unitId=${unitAId}`)),
    );
    expect(forbiddenExportStatementResponse.status).toBe(403);

    const forbiddenConnectStatusResponse = await routeModules.stripeConnectStatus.GET(
      new NextRequest(apiUrl(`/api/v1/stripe/connect/status?communityId=${communityA.id}`)),
    );
    expect(forbiddenConnectStatusResponse.status).toBe(403);

    const allowedResponse = await routeModules.ledger.GET(
      new NextRequest(apiUrl(`/api/v1/ledger?communityId=${communityC.id}`)),
    );
    expect(allowedResponse.status).toBe(200);
    const allowedJson = await parseJson<{ data: Array<Record<string, unknown>> }>(allowedResponse);
    expect(allowedJson.data.every((row) => row['unitId'] !== unitAId)).toBe(true);
    expect(allowedJson.data.every((row) => row['unitId'] === null || row['unitId'] !== unitAId)).toBe(true);
    expect(unitCId).toBeGreaterThan(0);
  });
});
