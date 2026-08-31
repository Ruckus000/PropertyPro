import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError } from '../../src/lib/api/errors/BadRequestError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireElectionsEnabledMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  listElectionProxiesForCommunityMock,
  createElectionProxyForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireElectionsEnabledMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  listElectionProxiesForCommunityMock: vi.fn(),
  createElectionProxyForCommunityMock: vi.fn(),
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

vi.mock('@/lib/elections/common', () => ({
  requireElectionsEnabled: requireElectionsEnabledMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/finance/common', () => ({
  requirePaymentsEnabled: vi.fn(),
  parsePositiveInt: (value: string, label: string) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestError(`${label} must be a positive integer`);
    }
    return parsed;
  },
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/elections-service', () => ({
  listElectionProxiesForCommunity: listElectionProxiesForCommunityMock,
  createElectionProxyForCommunity: createElectionProxyForCommunityMock,
}));

import { GET, POST } from '../../src/app/api/v1/elections/[id]/proxies/route';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'owner' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Owner',
  communityType: 'condo_718' as const,
};

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('/api/v1/elections/[id]/proxies route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requireElectionsEnabledMock.mockReturnValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    listElectionProxiesForCommunityMock.mockResolvedValue([
      {
        id: 10,
        electionId: 7,
        grantorUserId: 'user-1',
        grantorUnitId: 101,
        proxyHolderUserId: '2f5fceec-f6b2-47ec-a266-e1a94f2a53f7',
        status: 'pending',
        approvedByUserId: null,
        approvedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    createElectionProxyForCommunityMock.mockResolvedValue({
      id: 11,
      electionId: 7,
      grantorUserId: 'user-1',
      grantorUnitId: 101,
      proxyHolderUserId: '2f5fceec-f6b2-47ec-a266-e1a94f2a53f7',
      status: 'pending',
      approvedByUserId: null,
      approvedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
  });

  it('lists election proxies through GET', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/elections/7/proxies?communityId=42');
    const res = await GET(req, routeCtx('7'));

    expect(res.status).toBe(200);
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.anything(), 42);
    expect(requirePermissionMock).toHaveBeenCalledWith(MEMBERSHIP, 'elections', 'read');
    expect(listElectionProxiesForCommunityMock).toHaveBeenCalledWith(42, 7);
    const json = (await res.json()) as { data: Array<{ id: number }> };
    expect(json.data[0]?.id).toBe(10);
  });

  it('creates a proxy through POST and forwards x-request-id', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/elections/7/proxies', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-123',
      },
      body: JSON.stringify({
        communityId: 42,
        proxyHolderUserId: '2f5fceec-f6b2-47ec-a266-e1a94f2a53f7',
        grantorUnitId: 101,
      }),
    });
    const res = await POST(req, routeCtx('7'));

    expect(res.status).toBe(200);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requirePermissionMock).toHaveBeenCalledWith(MEMBERSHIP, 'elections', 'write');
    expect(createElectionProxyForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-1',
      {
        proxyHolderUserId: '2f5fceec-f6b2-47ec-a266-e1a94f2a53f7',
        grantorUnitId: 101,
      },
      'req-123',
    );
  });

  it('returns 400 when election id is non-numeric', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/elections/abc/proxies?communityId=42');
    const res = await GET(req, routeCtx('abc'));

    expect(res.status).toBe(400);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(listElectionProxiesForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 when election id is zero', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/elections/0/proxies?communityId=42');
    const res = await GET(req, routeCtx('0'));

    expect(res.status).toBe(400);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(listElectionProxiesForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 when POST body is invalid', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/elections/7/proxies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 42 }),
    });
    const res = await POST(req, routeCtx('7'));

    expect(res.status).toBe(400);
    expect(createElectionProxyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 when POST election id is non-numeric', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/elections/abc/proxies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        proxyHolderUserId: '2f5fceec-f6b2-47ec-a266-e1a94f2a53f7',
      }),
    });
    const res = await POST(req, routeCtx('abc'));

    expect(res.status).toBe(400);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(createElectionProxyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 when POST election id is zero', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/elections/0/proxies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        proxyHolderUserId: '2f5fceec-f6b2-47ec-a266-e1a94f2a53f7',
      }),
    });
    const res = await POST(req, routeCtx('0'));

    expect(res.status).toBe(400);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(createElectionProxyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when elections are disabled', async () => {
    requireElectionsEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Elections disabled');
    });

    const req = new NextRequest('http://localhost:3000/api/v1/elections/7/proxies?communityId=42');
    const res = await GET(req, routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });
});
