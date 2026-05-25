/**
 * Route unit test — `GET /api/v1/emergency-broadcasts/templates`.
 *
 * Added alongside Plan A1 drain #29 (Move 2 bundle). Asserts the 4-gate auth
 * chain (auth → community membership → requirePermission(emergency_broadcasts,
 * read)) and the runner's canonical 400 envelope.
 *
 * Note: `EMERGENCY_TEMPLATES` is a static constant import — not mocked here.
 * The happy-path test asserts the route returns whatever the constant
 * exports, which keeps this suite from going stale when templates are added.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

import { GET } from '../../src/app/api/v1/emergency-broadcasts/templates/route';
import { EMERGENCY_TEMPLATES } from '../../src/lib/constants/emergency-templates';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'CAM',
  communityType: 'condo_718' as const,
};

interface EnvelopeJson {
  data: unknown;
}

interface ErrorJson {
  error: { code: string; message: string };
}

function buildReq(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

describe('GET /api/v1/emergency-broadcasts/templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requirePermissionMock.mockImplementation(() => undefined);
  });

  it('returns templates — happy path', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/emergency-broadcasts/templates?communityId=42'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as EnvelopeJson;
    expect(json.data).toEqual(EMERGENCY_TEMPLATES);
    expect(requirePermissionMock).toHaveBeenCalledWith(MEMBERSHIP, 'emergency_broadcasts', 'read');
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      buildReq('http://localhost/api/v1/emergency-broadcasts/templates?communityId=42'),
    );

    expect(res.status).toBe(401);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requireCommunityMembership throws', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));

    const res = await GET(
      buildReq('http://localhost/api/v1/emergency-broadcasts/templates?communityId=42'),
    );

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requirePermission throws', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('insufficient permission');
    });

    const res = await GET(
      buildReq('http://localhost/api/v1/emergency-broadcasts/templates?communityId=42'),
    );

    expect(res.status).toBe(403);
  });

  it('returns 400 VALIDATION_ERROR when communityId is missing', async () => {
    const res = await GET(buildReq('http://localhost/api/v1/emergency-broadcasts/templates'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when communityId is non-numeric', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/emergency-broadcasts/templates?communityId=abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });
});
