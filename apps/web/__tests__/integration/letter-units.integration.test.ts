import { NextRequest } from 'next/server';
import { afterAll, beforeAll, expect, it } from 'vitest';
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
  seedCommunities,
  seedUsers,
  setActor,
  teardownTestKit,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('letter units integration tests');
const describeDb = getDescribeDb();

type VisitorsRouteModule = typeof import('../../src/app/api/v1/visitors/route');
type SearchUnitsRouteModule = typeof import('../../src/app/api/v1/search/units/route');

describeDb('letter-suffixed units across search and visitor flow', () => {
  let state: TestKitState | null = null;
  let visitorsRoute: VisitorsRouteModule | null = null;
  let searchUnitsRoute: SearchUnitsRouteModule | null = null;
  let communityId = 0;
  let unitA101 = '';
  let unit101B = '';
  let unitPH1 = '';
  let unitNumeric = '';

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();
    await seedCommunities(
      state,
      MULTI_TENANT_COMMUNITIES.filter((community) => community.key === 'communityC'),
    );

    const communityC = requireCommunity(state, 'communityC');
    communityId = communityC.id;

    const scoped = state.dbModule.createScopedClient(communityId);
    unitA101 = `A101-${state.runSuffix}`;
    unit101B = `101B-${state.runSuffix}`;
    unitPH1 = `PH-1-${state.runSuffix}`;
    unitNumeric = `101-${state.runSuffix}`;

    await scoped.insert(state.dbModule.units, { unitNumber: unitA101 });
    await scoped.insert(state.dbModule.units, { unitNumber: unit101B });
    await scoped.insert(state.dbModule.units, { unitNumber: unitPH1 });
    await scoped.insert(state.dbModule.units, { unitNumber: unitNumeric });

    const neededUsers: MultiTenantUserKey[] = ['siteManagerC'];
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((user) => neededUsers.includes(user.key)),
    );

    visitorsRoute = await import('../../src/app/api/v1/visitors/route');
    searchUnitsRoute = await import('../../src/app/api/v1/search/units/route');
  });

  afterAll(async () => {
    if (state) {
      await teardownTestKit(state);
    }
  });

  it('returns letter and numeric labels from /search/units for A, PH, and 10', async () => {
    if (!state || !searchUnitsRoute) return;
    setActor(state, 'siteManagerC');

    const searchAResponse = await searchUnitsRoute.GET(
      new NextRequest(apiUrl(`/api/v1/search/units?communityId=${communityId}&q=a&limit=20`)),
    );
    expect(searchAResponse.status).toBe(200);
    const searchAJson = await parseJson<{ results: Array<{ label: string }> }>(searchAResponse);
    expect(searchAJson.results.some((result) => result.label === unitA101)).toBe(true);

    const searchPhResponse = await searchUnitsRoute.GET(
      new NextRequest(apiUrl(`/api/v1/search/units?communityId=${communityId}&q=PH&limit=20`)),
    );
    expect(searchPhResponse.status).toBe(200);
    const searchPhJson = await parseJson<{ results: Array<{ label: string }> }>(searchPhResponse);
    expect(searchPhJson.results.some((result) => result.label === unitPH1)).toBe(true);

    const searchNumericResponse = await searchUnitsRoute.GET(
      new NextRequest(apiUrl(`/api/v1/search/units?communityId=${communityId}&q=10&limit=20`)),
    );
    expect(searchNumericResponse.status).toBe(200);
    const searchNumericJson = await parseJson<{ results: Array<{ label: string }> }>(searchNumericResponse);
    expect(searchNumericJson.results.some((result) => result.label === unitNumeric)).toBe(true);
    expect(searchNumericJson.results.some((result) => result.label === unit101B)).toBe(true);
  });

  it('registers a visitor with lowercase letter label and lists canonical hostUnitLabel', async () => {
    if (!state || !visitorsRoute) return;
    setActor(state, 'siteManagerC');

    const createResponse = await visitorsRoute.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId,
        visitorName: 'Letter Unit Guest',
        purpose: 'Tour',
        hostUnitLabel: unitA101.toLowerCase(),
        expectedArrival: '2026-06-21T18:00:00.000Z',
      }),
    );
    expect(createResponse.status).toBe(201);
    const createJson = await parseJson<{ data: { hostUnitLabel: string } }>(createResponse);
    expect(createJson.data.hostUnitLabel).toBe(unitA101);

    const listResponse = await visitorsRoute.GET(
      new NextRequest(apiUrl(`/api/v1/visitors?communityId=${communityId}`)),
    );
    expect(listResponse.status).toBe(200);
    const listJson = await parseJson<{
      data: { data: Array<{ hostUnitLabel: string | null }>; pagination: unknown };
    }>(listResponse);
    expect(listJson.data.data.some((row) => row.hostUnitLabel === unitA101)).toBe(true);
  });
});
