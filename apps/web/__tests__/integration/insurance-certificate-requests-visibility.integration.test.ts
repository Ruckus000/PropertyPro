/**
 * GET /api/v1/insurance/certificate-requests — who sees which requests.
 *
 * A certificate request carries the requesting owner's lender name, email,
 * loan number and unit. The route once relied on RLS to narrow a non-admin to
 * their own rows, but the scoped client connects as a privileged role and the
 * `pp_rls_*` policies return early via `pp_rls_is_privileged()`, so RLS
 * narrowed nothing: any owner with insurance:read saw every owner's requests.
 * The narrowing now lives in the route + service (`requested_by` in SQL).
 *
 * The first case pins that premise against a real database, so the route test
 * below cannot pass for the wrong reason: an unfiltered scoped read returns
 * BOTH owners' rows.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS } from '../fixtures/multi-tenant-users';
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
  requireUser,
  seedCommunities,
  seedUsers,
  setActor,
  setActorById,
  teardownTestKit,
  trackUserForCleanup,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Insurance certificate-request visibility integration tests');

const describeDb = getDescribeDb();

type CertificateRequestsRouteModule =
  typeof import('../../src/app/api/v1/insurance/certificate-requests/route');

interface RequestRow {
  id: number;
  requestedBy: string;
  recipientEmail: string;
  loanNumber: string | null;
}

interface Ctx {
  state: TestKitState;
  route: CertificateRequestsRouteModule;
  communityId: number;
  policyId: number;
  ownerAId: string;
  ownerBId: string;
}

let ctx: Ctx | null = null;
function req(): Ctx {
  if (!ctx) throw new Error('Test context not initialized');
  return ctx;
}

async function seedOwner(state: TestKitState, label: string): Promise<string> {
  const communityA = requireCommunity(state, 'communityA');
  const id = randomUUID();
  await state.db.insert(state.dbModule.users).values({
    id,
    email: `cert-owner-${label}+${state.runSuffix}@example.com`,
    fullName: `Cert Owner ${label.toUpperCase()} ${state.runSuffix}`,
    phone: null,
  });
  trackUserForCleanup(state, id);
  await state.dbModule.createScopedClient(communityA.id).insert(state.dbModule.userRoles, {
    userId: id,
    role: 'resident',
    isUnitOwner: true,
    displayTitle: 'Owner',
    presetKey: null,
    permissions: null,
    unitId: null,
  });
  return id;
}

async function listAs(userId: string): Promise<RequestRow[]> {
  const { state, route, communityId } = req();
  setActorById(state, userId);
  const res = await route.GET(
    new NextRequest(
      apiUrl(`/api/v1/insurance/certificate-requests?communityId=${communityId}`),
    ),
  );
  expect(res.status).toBe(200);
  const json = await parseJson<{ data: { requests: RequestRow[] } }>(res);
  return json.data.requests;
}

describeDb('insurance certificate-request visibility (db-backed)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    const state = await initTestKit();
    // communityA is condo_718 — the insurance hub is condo/HOA only.
    await seedCommunities(
      state,
      MULTI_TENANT_COMMUNITIES.filter((c) => c.key === 'communityA'),
    );
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((u) => u.key === 'actorA'),
    );
    const communityA = requireCommunity(state, 'communityA');

    const [policy] = await state.dbModule
      .createScopedClient(communityA.id)
      .insert(state.dbModule.insurancePolicies, {
        policyType: 'property',
        carrierName: `Cert Carrier ${state.runSuffix}`,
        expiresAt: '2099-12-31',
        agentEmail: `agent+${state.runSuffix}@example.com`,
        createdBy: requireUser(state, 'actorA').id,
      });

    const ownerAId = await seedOwner(state, 'a');
    const ownerBId = await seedOwner(state, 'b');

    ctx = {
      state,
      route: await import('../../src/app/api/v1/insurance/certificate-requests/route'),
      communityId: communityA.id,
      policyId: readNumberField(policy!, 'id'),
      ownerAId,
      ownerBId,
    };

    // Each owner creates a request through the real POST.
    for (const [ownerId, label] of [
      [ownerAId, 'a'],
      [ownerBId, 'b'],
    ] as const) {
      setActorById(state, ownerId);
      const res = await ctx.route.POST(
        jsonRequest(apiUrl('/api/v1/insurance/certificate-requests'), 'POST', {
          communityId: communityA.id,
          policyId: ctx.policyId,
          unitLabel: `Unit ${label.toUpperCase()}`,
          recipientName: `Lender ${label.toUpperCase()}`,
          recipientEmail: `lender-${label}+${state.runSuffix}@example.com`,
          loanNumber: `LOAN-${label.toUpperCase()}-${state.runSuffix}`,
        }),
      );
      expect(res.status).toBe(200);
    }
  });

  afterAll(async () => {
    if (ctx) await teardownTestKit(ctx.state);
  });

  it('premise: RLS does not narrow the scoped client — an unfiltered read returns both owners', async () => {
    const { state, communityId, ownerAId, ownerBId } = req();
    const rows = (await state.dbModule
      .createScopedClient(communityId)
      .selectFrom(state.dbModule.insuranceCertificateRequests, {})) as unknown as RequestRow[];
    expect(new Set(rows.map((r) => r.requestedBy))).toEqual(new Set([ownerAId, ownerBId]));
  });

  it("owner A's GET returns only owner A's request, never owner B's", async () => {
    const { state, ownerAId, ownerBId } = req();
    const rows = await listAs(ownerAId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.requestedBy).toBe(ownerAId);
    expect(rows[0]!.loanNumber).toBe(`LOAN-A-${state.runSuffix}`);
    expect(rows.some((r) => r.requestedBy === ownerBId)).toBe(false);
  });

  it("owner B's GET returns only owner B's request", async () => {
    const { ownerAId, ownerBId } = req();
    const rows = await listAs(ownerBId);
    expect(rows.map((r) => r.requestedBy)).toEqual([ownerBId]);
    expect(rows.some((r) => r.requestedBy === ownerAId)).toBe(false);
  });

  it('an admin-tier member sees every request, newest first', async () => {
    const { state, ownerAId, ownerBId } = req();
    setActor(state, 'actorA');
    const rows = await listAs(requireUser(state, 'actorA').id);
    expect(rows.map((r) => r.requestedBy)).toEqual([ownerBId, ownerAId]);
  });
});
