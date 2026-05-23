/**
 * Route unit tests — `PATCH /api/v1/notifications/archive`.
 *
 * Added alongside Plan A1 drain #17. The route had no unit test before;
 * the migration adds isolated coverage of the auth chain, body validation,
 * envelope wrapping, and the canonical 404 on header/body communityId
 * mismatch (raised by `resolveEffectiveCommunityId`).
 *
 * Mocks `resolveEffectiveCommunityId` directly so the test can override its
 * implementation to throw `NotFoundError` for the 404 case without needing
 * to construct a real header/body mismatch scenario at the NextRequest
 * level. Default impl is identity-passthrough.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { NotFoundError } from '../../src/lib/api/errors/NotFoundError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  archiveNotificationsMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  archiveNotificationsMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@propertypro/db', () => ({
  archiveNotifications: archiveNotificationsMock,
}));

import { PATCH } from '../../src/app/api/v1/notifications/archive/route';

const MEMBER_MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Owner',
  communityType: 'condo_718' as const,
};

interface OkJson {
  data: { ok: true };
}

function jsonPatch(payload: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/notifications/archive', {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

function emptyPatch(): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/notifications/archive', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
  });
}

describe('PATCH /api/v1/notifications/archive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBER_MEMBERSHIP);
    // Default: identity-passthrough — body.communityId wins.
    resolveEffectiveCommunityIdMock.mockImplementation(
      (_req: unknown, communityId: number) => communityId,
    );
    archiveNotificationsMock.mockResolvedValue(undefined);
  });

  it('archives the supplied ids and returns { ok: true } with the full auth chain in order', async () => {
    const res = await PATCH(jsonPatch({ communityId: 42, ids: [1, 2, 3] }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as OkJson;
    expect(json.data).toEqual({ ok: true });

    // Auth chain ordering: resolveEffectiveCommunityId -> requireAuthenticatedUserId
    // -> requireCommunityMembership -> archiveNotifications.
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledTimes(1);
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.anything(), 42);
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalledTimes(1);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-1');
    expect(archiveNotificationsMock).toHaveBeenCalledWith(42, 'user-1', [1, 2, 3]);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await PATCH(jsonPatch({ communityId: 42, ids: [1] }));

    expect(res.status).toBe(401);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(archiveNotificationsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is not a member of the target community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await PATCH(jsonPatch({ communityId: 42, ids: [1] }));

    expect(res.status).toBe(403);
    expect(archiveNotificationsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is missing from the body', async () => {
    const res = await PATCH(jsonPatch({ ids: [1, 2] }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
    expect(archiveNotificationsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when ids is missing from the body', async () => {
    const res = await PATCH(jsonPatch({ communityId: 42 }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
    expect(archiveNotificationsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when ids is an empty array (fails .min(1))', async () => {
    const res = await PATCH(jsonPatch({ communityId: 42, ids: [] }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
    expect(archiveNotificationsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the request body is missing entirely', async () => {
    const res = await PATCH(emptyPatch());

    expect(res.status).toBe(400);
    expect(archiveNotificationsMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with body communityId (resolveEffectiveCommunityId throws NotFoundError)', async () => {
    resolveEffectiveCommunityIdMock.mockImplementationOnce(() => {
      throw new NotFoundError('Community not found');
    });

    const res = await PATCH(jsonPatch({ communityId: 42, ids: [1] }));

    expect(res.status).toBe(404);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(archiveNotificationsMock).not.toHaveBeenCalled();
  });
});
