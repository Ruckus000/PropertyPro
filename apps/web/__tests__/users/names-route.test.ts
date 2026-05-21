/**
 * Route unit test — `GET /api/v1/users/names`.
 *
 * Updated alongside the Plan A1 drain (drain #2). The previous test used
 * `parseCommunityIdFromQuery` as the source-of-truth for community-id
 * reconciliation; the migrated route does that via `resolveEffectiveCommunityId`
 * inside `runRoute()`. New cases cover the contract's `query` validation
 * (missing communityId, missing/invalid ids) and the header/query mismatch
 * 404 path that replaces the pre-migration 400.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveUserDisplayNamesMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveUserDisplayNamesMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/utils/resolve-users', () => ({
  resolveUserDisplayNames: resolveUserDisplayNamesMock,
}));

import { GET } from '../../src/app/api/v1/users/names/route';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

describe('GET /api/v1/users/names', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('viewer-1');
    requireCommunityMembershipMock.mockResolvedValue({ communityId: 42 });
  });

  it('returns display names for the requested user IDs', async () => {
    resolveUserDisplayNamesMock.mockResolvedValue(
      new Map([
        [UUID_A, 'Alice Example'],
        [UUID_B, 'Bob Example'],
      ]),
    );

    const req = new NextRequest(
      `http://localhost:3000/api/v1/users/names?communityId=42&ids=${UUID_A},${UUID_B}`,
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalledTimes(1);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'viewer-1');
    expect(resolveUserDisplayNamesMock).toHaveBeenCalledWith(42, [UUID_A, UUID_B]);
    await expect(res.json()).resolves.toEqual({
      data: {
        [UUID_A]: 'Alice Example',
        [UUID_B]: 'Bob Example',
      },
    });
  });

  it('returns 403 when user is not a member of the requested community', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requireCommunityMembershipMock.mockRejectedValue(
      new ForbiddenError('Not a member of this community'),
    );

    const req = new NextRequest(
      `http://localhost:3000/api/v1/users/names?communityId=42&ids=${UUID_A}`,
    );
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(resolveUserDisplayNamesMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is missing', async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/v1/users/names?ids=${UUID_A}`,
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(resolveUserDisplayNamesMock).not.toHaveBeenCalled();
  });

  it('returns 400 when ids is missing or empty', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/users/names?communityId=42',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(resolveUserDisplayNamesMock).not.toHaveBeenCalled();
  });

  it('returns 400 when ids contains a non-UUID entry', async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/v1/users/names?communityId=42&ids=${UUID_A},not-a-uuid`,
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(resolveUserDisplayNamesMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the x-community-id header disagrees with the query (regression: pre-migration was 400)', async () => {
    // resolveEffectiveCommunityId throws NotFoundError on mismatch, matching
    // the document-categories pilot's canonical auth chain.
    const req = new NextRequest(
      `http://localhost:3000/api/v1/users/names?communityId=42&ids=${UUID_A}`,
      { headers: { 'x-community-id': '99' } },
    );
    const res = await GET(req);

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(resolveUserDisplayNamesMock).not.toHaveBeenCalled();
  });
});
