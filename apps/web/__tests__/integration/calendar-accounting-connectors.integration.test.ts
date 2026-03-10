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
  requireCommunity,
  requireDatabaseUrlInCI,
  requireUser,
  seedCommunities,
  seedUsers,
  setActor,
  teardownTestKit,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('WS70 calendar/accounting integration tests');

const describeDb = getDescribeDb();

type CalendarPublicRouteModule = typeof import('../../src/app/api/v1/calendar/meetings.ics/route');
type CalendarMyRouteModule = typeof import('../../src/app/api/v1/calendar/my-meetings.ics/route');
type GoogleConnectRouteModule = typeof import('../../src/app/api/v1/calendar/google/connect/route');
type GoogleCallbackRouteModule = typeof import('../../src/app/api/v1/calendar/google/callback/route');
type GoogleSyncRouteModule = typeof import('../../src/app/api/v1/calendar/google/sync/route');
type GoogleDisconnectRouteModule = typeof import('../../src/app/api/v1/calendar/google/disconnect/route');
type AccountingConnectRouteModule = typeof import('../../src/app/api/v1/accounting/connect/route');
type AccountingCallbackRouteModule = typeof import('../../src/app/api/v1/accounting/callback/route');
type AccountingExportRouteModule = typeof import('../../src/app/api/v1/accounting/export/route');
type AccountingMappingRouteModule = typeof import('../../src/app/api/v1/accounting/mapping/route');
type AccountingDisconnectRouteModule = typeof import('../../src/app/api/v1/accounting/disconnect/route');

interface RouteModules {
  calendarPublic: CalendarPublicRouteModule;
  calendarMy: CalendarMyRouteModule;
  googleConnect: GoogleConnectRouteModule;
  googleCallback: GoogleCallbackRouteModule;
  googleSync: GoogleSyncRouteModule;
  googleDisconnect: GoogleDisconnectRouteModule;
  accountingConnect: AccountingConnectRouteModule;
  accountingCallback: AccountingCallbackRouteModule;
  accountingExport: AccountingExportRouteModule;
  accountingMapping: AccountingMappingRouteModule;
  accountingDisconnect: AccountingDisconnectRouteModule;
}

let state: TestKitState | null = null;
let routes: RouteModules | null = null;

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

describeDb('WS70 calendar/accounting connectors (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    process.env.TOKEN_ENCRYPTION_KEY =
      process.env.TOKEN_ENCRYPTION_KEY
      ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    state = await initTestKit();

    const selectedCommunities = MULTI_TENANT_COMMUNITIES.filter((community) =>
      ['communityA', 'communityB', 'communityC'].includes(community.key),
    );
    await seedCommunities(state, selectedCommunities);

    const neededUsers: MultiTenantUserKey[] = ['actorA', 'actorB', 'actorC'];
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((user) => neededUsers.includes(user.key)),
    );

    const communityA = requireCommunity(state, 'communityA');
    const communityB = requireCommunity(state, 'communityB');
    const actorA = requireUser(state, 'actorA');
    const actorC = requireUser(state, 'actorC');

    const scopedA = state.dbModule.createScopedClient(communityA.id);
    const scopedB = state.dbModule.createScopedClient(communityB.id);
    const communityC = requireCommunity(state, 'communityC');
    const scopedC = state.dbModule.createScopedClient(communityC.id);

    await scopedA.insert(state.dbModule.meetings, {
      title: `WS70 Board Meeting ${state.runSuffix}`,
      meetingType: 'board',
      startsAt: new Date('2026-06-20T14:00:00.000Z'),
      location: 'Clubhouse A',
    });

    await scopedB.insert(state.dbModule.meetings, {
      title: `WS70 HOA Meeting ${state.runSuffix}`,
      meetingType: 'board',
      startsAt: new Date('2026-06-22T15:00:00.000Z'),
      location: 'Clubhouse B',
    });

    await state.dbModule.postLedgerEntry(scopedA, {
      entryType: 'assessment',
      amountCents: 12500,
      description: 'Monthly assessment',
      sourceType: 'assessment',
      sourceId: `assessment-${state.runSuffix}`,
      createdByUserId: actorA.id,
    });

    await state.dbModule.postLedgerEntry(scopedA, {
      entryType: 'payment',
      amountCents: -12500,
      description: 'Assessment payment',
      sourceType: 'payment',
      sourceId: `payment-${state.runSuffix}`,
      createdByUserId: actorA.id,
    });

    await state.dbModule.postLedgerEntry(scopedA, {
      entryType: 'fee',
      amountCents: 2500,
      description: 'Late fee',
      sourceType: 'manual',
      sourceId: `fee-${state.runSuffix}`,
      createdByUserId: actorA.id,
    });

    await state.dbModule.postLedgerEntry(scopedC, {
      entryType: 'assessment',
      amountCents: 9800,
      description: 'Apartment assessment',
      sourceType: 'assessment',
      sourceId: `assessment-c-${state.runSuffix}`,
      createdByUserId: actorC.id,
    });

    await state.dbModule.postLedgerEntry(scopedC, {
      entryType: 'payment',
      amountCents: -9800,
      description: 'Apartment payment',
      sourceType: 'payment',
      sourceId: `payment-c-${state.runSuffix}`,
      createdByUserId: actorC.id,
    });

    await state.dbModule.postLedgerEntry(scopedC, {
      entryType: 'fee',
      amountCents: 1500,
      description: 'Apartment late fee',
      sourceType: 'manual',
      sourceId: `fee-c-${state.runSuffix}`,
      createdByUserId: actorC.id,
    });

    routes = {
      calendarPublic: await import('../../src/app/api/v1/calendar/meetings.ics/route'),
      calendarMy: await import('../../src/app/api/v1/calendar/my-meetings.ics/route'),
      googleConnect: await import('../../src/app/api/v1/calendar/google/connect/route'),
      googleCallback: await import('../../src/app/api/v1/calendar/google/callback/route'),
      googleSync: await import('../../src/app/api/v1/calendar/google/sync/route'),
      googleDisconnect: await import('../../src/app/api/v1/calendar/google/disconnect/route'),
      accountingConnect: await import('../../src/app/api/v1/accounting/connect/route'),
      accountingCallback: await import('../../src/app/api/v1/accounting/callback/route'),
      accountingExport: await import('../../src/app/api/v1/accounting/export/route'),
      accountingMapping: await import('../../src/app/api/v1/accounting/mapping/route'),
      accountingDisconnect: await import('../../src/app/api/v1/accounting/disconnect/route'),
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

  it('serves ICS feeds and enforces membership on my-meetings feed', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityB = requireCommunity(kit, 'communityB');

    const publicResponse = await routeModules.calendarPublic.GET(
      new NextRequest(apiUrl(`/api/v1/calendar/meetings.ics?communityId=${communityA.id}`)),
    );
    expect(publicResponse.status).toBe(200);

    const publicBody = await publicResponse.text();
    expect(publicBody).toContain(`WS70 Board Meeting ${kit.runSuffix}`);
    expect(publicBody).not.toContain(`WS70 HOA Meeting ${kit.runSuffix}`);

    setActor(kit, 'actorA');
    const myFeedResponse = await routeModules.calendarMy.GET(
      new NextRequest(apiUrl(`/api/v1/calendar/my-meetings.ics?communityId=${communityA.id}`)),
    );
    expect(myFeedResponse.status).toBe(200);

    const myFeedBody = await myFeedResponse.text();
    expect(myFeedBody).toContain(`WS70 Board Meeting ${kit.runSuffix}`);

    setActor(kit, 'actorB');
    const crossTenantResponse = await routeModules.calendarMy.GET(
      new NextRequest(apiUrl(`/api/v1/calendar/my-meetings.ics?communityId=${communityA.id}`)),
    );
    expect(crossTenantResponse.status).toBe(403);

    const publicCommunityB = await routeModules.calendarPublic.GET(
      new NextRequest(apiUrl(`/api/v1/calendar/meetings.ics?communityId=${communityB.id}`)),
    );
    expect(publicCommunityB.status).toBe(200);
    const publicCommunityBBody = await publicCommunityB.text();
    expect(publicCommunityBBody).toContain(`WS70 HOA Meeting ${kit.runSuffix}`);
  });

  it('runs deterministic Google calendar connect/sync/disconnect lifecycle', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'actorA');
    const connectResponse = await routeModules.googleConnect.POST(
      jsonRequest(apiUrl('/api/v1/calendar/google/connect'), 'POST', {
        communityId: communityA.id,
      }),
    );
    expect(connectResponse.status).toBe(200);
    const connectJson = await parseJson<{ data: { authorizationUrl: string } }>(connectResponse);
    expect(connectJson.data.authorizationUrl).toContain('oauth.google.example');

    const callbackResponse = await routeModules.googleCallback.GET(
      new NextRequest(
        apiUrl(`/api/v1/calendar/google/callback?communityId=${communityA.id}&code=google-code-123`),
      ),
    );
    expect(callbackResponse.status).toBe(200);

    const syncResponse = await routeModules.googleSync.POST(
      jsonRequest(apiUrl('/api/v1/calendar/google/sync'), 'POST', {
        communityId: communityA.id,
      }),
    );
    expect(syncResponse.status).toBe(200);
    const syncJson = await parseJson<{ data: { syncedCount: number } }>(syncResponse);
    expect(syncJson.data.syncedCount).toBeGreaterThanOrEqual(1);

    const disconnectResponse = await routeModules.googleDisconnect.DELETE(
      jsonRequest(apiUrl('/api/v1/calendar/google/disconnect'), 'DELETE', {
        communityId: communityA.id,
      }),
    );
    expect(disconnectResponse.status).toBe(200);

    const postDisconnectSync = await routeModules.googleSync.POST(
      jsonRequest(apiUrl('/api/v1/calendar/google/sync'), 'POST', {
        communityId: communityA.id,
      }),
    );
    expect(postDisconnectSync.status).toBe(404);

    setActor(kit, 'actorB');
    const crossTenantConnect = await routeModules.googleConnect.POST(
      jsonRequest(apiUrl('/api/v1/calendar/google/connect'), 'POST', {
        communityId: communityA.id,
      }),
    );
    expect(crossTenantConnect.status).toBe(403);
  });

  it('runs accounting connect/mapping/export/disconnect with unmapped warning behavior', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');

    setActor(kit, 'actorC');
    const connectResponse = await routeModules.accountingConnect.POST(
      jsonRequest(apiUrl('/api/v1/accounting/connect'), 'POST', {
        communityId: communityC.id,
        provider: 'quickbooks',
      }),
    );
    expect(connectResponse.status).toBe(200);

    const callbackResponse = await routeModules.accountingCallback.GET(
      new NextRequest(
        apiUrl(`/api/v1/accounting/callback?communityId=${communityC.id}&provider=quickbooks&code=qbo-code-456`),
      ),
    );
    expect(callbackResponse.status).toBe(200);

    const mappingResponse = await routeModules.accountingMapping.GET(
      new NextRequest(
        apiUrl(`/api/v1/accounting/mapping?communityId=${communityC.id}&provider=quickbooks`),
      ),
    );
    expect(mappingResponse.status).toBe(200);
    const mappingJson = await parseJson<{ data: { discoveredAccounts: Array<{ category: string }> } }>(mappingResponse);
    expect(mappingJson.data.discoveredAccounts.some((entry) => entry.category === 'assessment')).toBe(true);

    const updateMappingResponse = await routeModules.accountingMapping.PUT(
      new NextRequest(apiUrl('/api/v1/accounting/mapping'), {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          communityId: communityC.id,
          provider: 'quickbooks',
          mapping: {
            assessment: 'qbo-income-assessment',
            payment: 'qbo-cash-operating',
          },
        }),
      }),
    );

    expect(updateMappingResponse.status).toBe(200);

    const exportResponse = await routeModules.accountingExport.POST(
      jsonRequest(apiUrl('/api/v1/accounting/export'), 'POST', {
        communityId: communityC.id,
        provider: 'quickbooks',
      }),
    );
    expect(exportResponse.status).toBe(200);
    const exportJson = await parseJson<{
      data: { exportedCount: number; skippedCount: number; warnings: string[] };
    }>(exportResponse);

    expect(exportJson.data.exportedCount).toBeGreaterThanOrEqual(2);
    expect(exportJson.data.skippedCount).toBeGreaterThanOrEqual(1);
    expect(
      exportJson.data.warnings.some((warning) => warning.includes('no account mapping for category "fee"')),
    ).toBe(true);

    setActor(kit, 'actorB');
    const crossTenantMapping = await routeModules.accountingMapping.GET(
      new NextRequest(
        apiUrl(`/api/v1/accounting/mapping?communityId=${communityC.id}&provider=quickbooks`),
      ),
    );
    expect(crossTenantMapping.status).toBe(403);

    setActor(kit, 'actorC');
    const disconnectResponse = await routeModules.accountingDisconnect.DELETE(
      jsonRequest(apiUrl('/api/v1/accounting/disconnect'), 'DELETE', {
        communityId: communityC.id,
        provider: 'quickbooks',
      }),
    );
    expect(disconnectResponse.status).toBe(200);
  });
});
