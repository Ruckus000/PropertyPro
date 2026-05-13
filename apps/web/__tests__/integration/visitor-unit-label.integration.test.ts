import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

requireDatabaseUrlInCI('visitor unit label flow');
const describeDb = getDescribeDb();

type VisitorsRouteModule = typeof import('../../src/app/api/v1/visitors/route');

describeDb('visitor registration by unit label (db-backed integration)', () => {
  let state: TestKitState | null = null;
  let routes: VisitorsRouteModule | null = null;
  let communityId: number;
  let unitLabel: string;
  let dupeLabel: string;
  let otherLabel: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    state = await initTestKit();

    await seedCommunities(
      state,
      MULTI_TENANT_COMMUNITIES.filter((c) => c.key === 'communityA'),
    );
    const communityA = requireCommunity(state, 'communityA');
    communityId = communityA.id;

    const scoped = state.dbModule.createScopedClient(communityId);
    unitLabel = `101A-${state.runSuffix}`;
    dupeLabel = `DUP-${state.runSuffix}`;
    otherLabel = `OTH-${state.runSuffix}`;

    const [primaryUnit] = await scoped.insert(state.dbModule.units, { unitNumber: unitLabel });
    const primaryUnitId = readNumberField(primaryUnit, 'id');

    await scoped.insert(state.dbModule.units, { unitNumber: dupeLabel });
    await scoped.insert(state.dbModule.units, { unitNumber: dupeLabel });
    await scoped.insert(state.dbModule.units, { unitNumber: otherLabel });

    const neededUsers: MultiTenantUserKey[] = ['actorA', 'tenantA'];
    const unitMap = new Map<MultiTenantUserKey, number>();
    unitMap.set('tenantA', primaryUnitId);
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((u) => neededUsers.includes(u.key)),
      unitMap,
    );

    routes = await import('../../src/app/api/v1/visitors/route');
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('staff create by lowercase label resolves to the seeded unit and list returns hostUnitLabel', async () => {
    if (!state || !routes) return;
    setActor(state, 'actorA');

    const createRes = await routes.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId,
        visitorName: 'Guest A',
        purpose: 'Visit',
        hostUnitLabel: unitLabel.toLowerCase(),
        expectedArrival: '2026-06-21T18:00:00.000Z',
      }),
    );
    expect(createRes.status).toBe(201);
    const createdJson = await parseJson<{ data: { hostUnitLabel: string; hostUnitId: number } }>(createRes);
    expect(createdJson.data.hostUnitLabel).toBe(unitLabel);

    const listRes = await routes.GET(
      new NextRequest(apiUrl(`/api/v1/visitors?communityId=${communityId}`)),
    );
    expect(listRes.status).toBe(200);
    const listJson = await parseJson<{
      data: { data: Array<{ hostUnitLabel: string | null }>; pagination: unknown };
    }>(listRes);
    const match = listJson.data.data.find((row) => row.hostUnitLabel === unitLabel);
    expect(match).toBeDefined();
  });

  it('rejects a missing label with a ValidationError and does not create a visitor', async () => {
    if (!state || !routes) return;
    setActor(state, 'actorA');

    const res = await routes.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId,
        visitorName: 'Guest B',
        purpose: 'Visit',
        hostUnitLabel: 'DOES-NOT-EXIST',
        expectedArrival: '2026-06-21T18:00:00.000Z',
      }),
    );
    expect(res.status).toBe(400);
    const body = await parseJson<{ error: { details?: { fields?: Record<string, string> } } }>(res);
    expect(body.error?.details?.fields?.hostUnitLabel).toMatch(/not found/i);
  });

  it('rejects an ambiguous label with a clear ValidationError', async () => {
    if (!state || !routes) return;
    setActor(state, 'actorA');

    const res = await routes.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId,
        visitorName: 'Guest C',
        purpose: 'Visit',
        hostUnitLabel: dupeLabel,
        expectedArrival: '2026-06-21T18:00:00.000Z',
      }),
    );
    expect(res.status).toBe(400);
    const body = await parseJson<{ error: { details?: { fields?: Record<string, string> } } }>(res);
    expect(body.error?.details?.fields?.hostUnitLabel).toMatch(/multiple|ambiguous|duplicate/i);
  });

  it('resident receives generic error when label does not match their own unit', async () => {
    if (!state || !routes) return;
    setActor(state, 'tenantA');

    const res = await routes.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId,
        visitorName: 'Sneaky Guest',
        purpose: 'Visit',
        hostUnitLabel: otherLabel,
        expectedArrival: '2026-06-21T18:00:00.000Z',
      }),
    );
    expect(res.status).toBe(400);
    const body = await parseJson<{ error: { details?: { fields?: Record<string, string> } } }>(res);
    expect(body.error?.details?.fields?.hostUnitLabel).toMatch(/not found or not accessible/i);
  });
});
