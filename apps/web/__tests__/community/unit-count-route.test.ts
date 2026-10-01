/**
 * Route unit tests — `PATCH /api/v1/community/unit-count`.
 *
 * The count decides whether Florida's website rules apply to the association
 * (packages/shared `requirementLevel`), so who may change it, and what reaches
 * the service, is the whole contract. Same harness as contact-route.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  assertNotDemoGraceMock,
  updateCommunityUnitCountMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  updateCommunityUnitCountMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));
vi.mock('@/lib/services/community-profile-service', () => ({
  updateCommunityUnitCount: updateCommunityUnitCountMock,
}));

import { PATCH } from '../../src/app/api/v1/community/unit-count/route';

const ADMIN = { userId: 'admin-1', communityId: 42, role: 'property_manager', isAdmin: true };
const OWNER = { userId: 'owner-1', communityId: 42, role: 'resident', isAdmin: false };

function patch(payload: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/community/unit-count', {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('PATCH /api/v1/community/unit-count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('admin-1');
    requireCommunityMembershipMock.mockResolvedValue(ADMIN);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    updateCommunityUnitCountMock.mockResolvedValue({ unitCount: 40, changed: true });
  });

  it('stores the count for an admin, with the actor for the audit row', async () => {
    const res = await PATCH(patch({ communityId: 42, unitCount: 40 }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { unitCount: 40 } });
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'admin-1');
    expect(updateCommunityUnitCountMock).toHaveBeenCalledWith(42, 40, { actorUserId: 'admin-1' });
  });

  it('401s without a session, before touching anything', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());

    const res = await PATCH(patch({ communityId: 42, unitCount: 40 }));

    expect(res.status).toBe(401);
    expect(updateCommunityUnitCountMock).not.toHaveBeenCalled();
  });

  it('403s a member who is not an admin', async () => {
    requireCommunityMembershipMock.mockResolvedValue(OWNER);

    const res = await PATCH(patch({ communityId: 42, unitCount: 10 }));

    expect(res.status).toBe(403);
    expect(updateCommunityUnitCountMock).not.toHaveBeenCalled();
  });

  it('403s a non-member', async () => {
    requireCommunityMembershipMock.mockRejectedValue(new ForbiddenError('Not a member'));

    const res = await PATCH(patch({ communityId: 42, unitCount: 10 }));

    expect(res.status).toBe(403);
    expect(updateCommunityUnitCountMock).not.toHaveBeenCalled();
  });

  it('refuses a demo in its grace period before checking membership', async () => {
    assertNotDemoGraceMock.mockRejectedValue(new ForbiddenError('Demo is read-only'));

    const res = await PATCH(patch({ communityId: 42, unitCount: 40 }));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(updateCommunityUnitCountMock).not.toHaveBeenCalled();
  });

  it.each([
    ['zero', { communityId: 42, unitCount: 0 }],
    ['a fraction', { communityId: 42, unitCount: 12.5 }],
    ['above the column CHECK', { communityId: 42, unitCount: 100_001 }],
    // Unknown cannot be restored: it exists only for rows predating the column.
    ['null (clearing back to unknown)', { communityId: 42, unitCount: null }],
    ['a missing count', { communityId: 42 }],
    ['an extra field', { communityId: 42, unitCount: 40, communityType: 'apartment' }],
  ])('400s %s', async (_label, payload) => {
    const res = await PATCH(patch(payload));

    expect(res.status).toBe(400);
    expect(updateCommunityUnitCountMock).not.toHaveBeenCalled();
  });

  it('404s when the body names a different community than the request header', async () => {
    const res = await PATCH(patch({ communityId: 42, unitCount: 40 }, { 'x-community-id': '99' }));

    expect(res.status).toBe(404);
    expect(updateCommunityUnitCountMock).not.toHaveBeenCalled();
  });
});
