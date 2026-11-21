/**
 * Join requests against a real database (D12).
 *
 * - An apartment community has no unit owners, so `createJoinRequest` refuses
 *   an owner request to one and approval turns a legacy owner request into a
 *   tenant membership. Both read `communities.community_type` through SQL that
 *   a mocked builder cannot prove.
 * - `listJoinRequestsForUser` is the requester's view: their own rows only,
 *   each with the community's name (a LEFT JOIN), and never `reviewedBy`.
 *
 * Seeds communityA (condo) and communityC (apartment), plus tenantA, a member
 * of communityA only, who asks to join both.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from '@propertypro/db/filters';
import {
  initTestKit,
  seedCommunities,
  seedUsers,
  teardownTestKit,
  requireCommunity,
  requireUser,
  getDescribeDb,
  requireDatabaseUrlInCI,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS } from '../fixtures/multi-tenant-users';
import {
  approveJoinRequest,
  createJoinRequest,
  listJoinRequestsForUser,
} from '@/lib/join-requests/approve-request';

requireDatabaseUrlInCI('join-requests-apartment-tenant-only');

const describeDb = getDescribeDb();

describeDb('join requests — apartments are tenant-only; requesters see their own', () => {
  let state: TestKitState;
  let condoId: number;
  let apartmentId: number;
  let requesterId: string;
  let reviewerId: string;

  beforeAll(async () => {
    state = await initTestKit();
    await seedCommunities(
      state,
      MULTI_TENANT_COMMUNITIES.filter((c) => c.key === 'communityA' || c.key === 'communityC'),
    );
    condoId = requireCommunity(state, 'communityA').id;
    apartmentId = requireCommunity(state, 'communityC').id;
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((u) => u.key === 'tenantA' || u.key === 'siteManagerC'),
    );
    requesterId = requireUser(state, 'tenantA').id;
    reviewerId = requireUser(state, 'siteManagerC').id;
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('refuses an owner request to an apartment with a residentType field error', async () => {
    const error = await createJoinRequest({
      userId: requesterId,
      communityId: apartmentId,
      unitIdentifier: 'Apt 3B',
      residentType: 'owner',
    }).catch((e: unknown) => e);

    expect(error).toMatchObject({
      statusCode: 400,
      details: { fields: [{ field: 'residentType' }] },
    });
    expect(await listJoinRequestsForUser(requesterId)).toEqual([]);
  });

  it('404s a community that does not exist instead of inserting', async () => {
    await expect(
      createJoinRequest({
        userId: requesterId,
        communityId: 2_000_000_000,
        unitIdentifier: '1',
        residentType: 'tenant',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lists the requester's own requests, newest first, named, without reviewedBy", async () => {
    await createJoinRequest({
      userId: requesterId,
      communityId: condoId,
      unitIdentifier: '101',
      residentType: 'owner',
    });
    const apartmentRequest = await createJoinRequest({
      userId: requesterId,
      communityId: apartmentId,
      unitIdentifier: 'Apt 3B',
      residentType: 'tenant',
    });

    const rows = await listJoinRequestsForUser(requesterId);

    expect(rows.map((r) => [r.communityId, r.residentType, r.status])).toEqual([
      [apartmentId, 'tenant', 'pending'],
      [condoId, 'owner', 'pending'],
    ]);
    expect(rows[0]!.id).toBe(apartmentRequest.id);
    expect(rows[0]!.communityName).toContain(requireCommunity(state, 'communityC').fixture.name);
    expect(rows[1]!.communityName).toContain(requireCommunity(state, 'communityA').fixture.name);
    for (const row of rows) {
      expect(row).not.toHaveProperty('reviewedBy');
      expect(row).not.toHaveProperty('userId');
    }

    // Another user's requests are not in it.
    expect(await listJoinRequestsForUser(reviewerId)).toEqual([]);
  });

  it('approves a legacy OWNER request to an apartment as a tenant membership', async () => {
    const { communityJoinRequests, userRoles, notifications } = state.dbModule;

    // Simulate a request filed before submit refused owners for apartments:
    // the pending apartment request from the previous case, flipped to owner.
    const [pendingRow] = await state.db
      .update(communityJoinRequests)
      .set({ residentType: 'owner' })
      .where(
        and(
          eq(communityJoinRequests.userId, requesterId),
          eq(communityJoinRequests.communityId, apartmentId),
        ),
      )
      .returning({ id: communityJoinRequests.id });

    await approveJoinRequest({ requestId: pendingRow!.id, reviewerUserId: reviewerId });

    const [role] = await state.db
      .select({ isUnitOwner: userRoles.isUnitOwner, displayTitle: userRoles.displayTitle })
      .from(userRoles)
      .where(and(eq(userRoles.userId, requesterId), eq(userRoles.communityId, apartmentId)));
    expect(role).toEqual({ isUnitOwner: false, displayTitle: 'Tenant' });

    const [notice] = await state.db
      .select({ actionUrl: notifications.actionUrl })
      .from(notifications)
      .where(
        and(eq(notifications.userId, requesterId), eq(notifications.communityId, apartmentId)),
      );
    expect(notice?.actionUrl).toBe(`/dashboard?communityId=${apartmentId}`);

    const [listed] = (await listJoinRequestsForUser(requesterId)).filter(
      (r) => r.communityId === apartmentId,
    );
    expect(listed?.status).toBe('approved');
    expect(listed?.reviewedAt).toBeInstanceOf(Date);
  });
});
