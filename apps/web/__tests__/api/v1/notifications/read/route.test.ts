/**
 * Route unit tests — `PATCH /api/v1/notifications/read`.
 *
 * Added alongside the Plan A1 drain (drain #7). The route had no unit
 * test before; the migration adds isolated coverage of the auth chain,
 * body validation (both union branches), envelope wrapping, and the
 * canonical 404 on header/body communityId mismatch.
 *
 * First drain to exercise a Zod discriminated-union body in the runner
 * (`{ ids: number[] }` XOR `{ all: true }`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../../../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../../../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  markNotificationsReadMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  markNotificationsReadMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@propertypro/db', () => ({
  markNotificationsRead: markNotificationsReadMock,
}));

import { PATCH } from '../../../../../src/app/api/v1/notifications/read/route';

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
  return new NextRequest('http://localhost:3000/api/v1/notifications/read', {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

function emptyPatch(headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/notifications/read', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('PATCH /api/v1/notifications/read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBER_MEMBERSHIP);
    markNotificationsReadMock.mockResolvedValue(undefined);
  });

  it('marks the supplied ids as read and returns { ok: true }', async () => {
    const res = await PATCH(jsonPatch({ communityId: 42, ids: [1, 2, 3] }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as OkJson;
    expect(json.data).toEqual({ ok: true });
    expect(markNotificationsReadMock).toHaveBeenCalledWith(42, 'user-1', [1, 2, 3]);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-1');
  });

  it('marks all notifications read when { all: true } is supplied', async () => {
    const res = await PATCH(jsonPatch({ communityId: 42, all: true }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as OkJson;
    expect(json.data).toEqual({ ok: true });
    expect(markNotificationsReadMock).toHaveBeenCalledWith(42, 'user-1', undefined);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await PATCH(jsonPatch({ communityId: 42, ids: [1] }));

    expect(res.status).toBe(401);
    expect(markNotificationsReadMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is not a member of the target community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await PATCH(jsonPatch({ communityId: 42, ids: [1] }));

    expect(res.status).toBe(403);
    expect(markNotificationsReadMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the request body is missing entirely', async () => {
    const res = await PATCH(emptyPatch());

    expect(res.status).toBe(400);
    expect(markNotificationsReadMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the body matches neither union branch', async () => {
    const res = await PATCH(jsonPatch({ communityId: 1 }));

    expect(res.status).toBe(400);
    expect(markNotificationsReadMock).not.toHaveBeenCalled();
  });

  it('returns 400 when ids is an empty array (fails .min(1))', async () => {
    const res = await PATCH(jsonPatch({ communityId: 42, ids: [] }));

    expect(res.status).toBe(400);
    expect(markNotificationsReadMock).not.toHaveBeenCalled();
  });

  it('returns 400 when all is not the literal true', async () => {
    const res = await PATCH(jsonPatch({ communityId: 42, all: false }));

    expect(res.status).toBe(400);
    expect(markNotificationsReadMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with body communityId', async () => {
    const res = await PATCH(
      jsonPatch({ communityId: 42, ids: [1] }, { 'x-community-id': '99' }),
    );

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(markNotificationsReadMock).not.toHaveBeenCalled();
  });
});
