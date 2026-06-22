import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { ConflictError } from '../../src/lib/api/errors/ConflictError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireRoleMock,
  assertNotDemoGraceMock,
  requirePlanFeatureMock,
  getDomainMock,
  setDomainMock,
  verifyDomainMock,
  removeDomainMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn((_: unknown, id: number) => id),
  requireRoleMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn().mockResolvedValue(undefined),
  requirePlanFeatureMock: vi.fn().mockResolvedValue(undefined),
  getDomainMock: vi.fn(),
  setDomainMock: vi.fn(),
  verifyDomainMock: vi.fn(),
  removeDomainMock: vi.fn(),
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
vi.mock('@/lib/api/role-guard', () => ({
  requireRole: requireRoleMock,
  PM_MANAGER_ROLES: ['property_manager', 'root_manager'],
}));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));
vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));
vi.mock('@/lib/services/custom-domain-service', () => ({
  getDomain: getDomainMock,
  setDomain: setDomainMock,
  verifyDomain: verifyDomainMock,
  removeDomain: removeDomainMock,
}));

import { GET, POST, DELETE } from '../../src/app/api/v1/pm/site/domain/route';
import { POST as VERIFY_POST } from '../../src/app/api/v1/pm/site/domain/verify/route';

const PM_MEMBERSHIP = {
  role: 'pm_admin',
  communityId: 1,
};

const PENDING_STATE = {
  domain: 'www.example.com',
  status: 'pending' as const,
  verifiedAt: null,
  records: [{ type: 'CNAME', name: 'www.example.com', value: 'cname.vercel-dns.com' }],
  reason: null,
};

const ACTIVE_STATE = {
  domain: 'www.example.com',
  status: 'active' as const,
  verifiedAt: '2026-01-02T03:04:05.000Z',
  records: [],
  reason: null,
};

function postReq(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/site/domain', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('pm site domain route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('pm-1');
    requireCommunityMembershipMock.mockResolvedValue(PM_MEMBERSHIP);
    resolveEffectiveCommunityIdMock.mockImplementation((_: unknown, id: number) => id);
    requireRoleMock.mockReturnValue(undefined);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    getDomainMock.mockResolvedValue(ACTIVE_STATE);
    setDomainMock.mockResolvedValue(PENDING_STATE);
    verifyDomainMock.mockResolvedValue(ACTIVE_STATE);
    removeDomainMock.mockResolvedValue(undefined);
  });

  describe('GET', () => {
    it('returns 200 with the persisted domain state', async () => {
      const req = new NextRequest('http://localhost/api/v1/pm/site/domain?communityId=1');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: typeof ACTIVE_STATE };
      expect(json.data).toEqual(ACTIVE_STATE);
      expect(getDomainMock).toHaveBeenCalledWith(1);
      expect(requirePlanFeatureMock).toHaveBeenCalledWith(1, 'hasSiteCustomDomain');
    });

    it('returns 400 for a missing communityId', async () => {
      const req = new NextRequest('http://localhost/api/v1/pm/site/domain');
      const res = await GET(req);
      expect(res.status).toBe(400);
      expect(getDomainMock).not.toHaveBeenCalled();
    });

    it('returns 401 for an unauthenticated user', async () => {
      requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
      const req = new NextRequest('http://localhost/api/v1/pm/site/domain?communityId=1');
      const res = await GET(req);
      expect(res.status).toBe(401);
      expect(getDomainMock).not.toHaveBeenCalled();
    });
  });

  describe('POST', () => {
    it('returns 200 and provisions the domain (happy path)', async () => {
      const res = await POST(postReq('/api/v1/pm/site/domain', { communityId: 1, domain: 'www.example.com' }));

      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: typeof PENDING_STATE };
      expect(json.data).toEqual(PENDING_STATE);
      expect(setDomainMock).toHaveBeenCalledWith(1, 'pm-1', 'www.example.com');
    });

    it('allows a property_manager role', async () => {
      requireCommunityMembershipMock.mockResolvedValueOnce({ role: 'property_manager', communityId: 1 });
      const res = await POST(postReq('/api/v1/pm/site/domain', { communityId: 1, domain: 'www.example.com' }));

      expect(res.status).toBe(200);
      expect(requireRoleMock).toHaveBeenCalledWith(
        { role: 'property_manager', communityId: 1 },
        ['property_manager', 'root_manager'],
        expect.any(String),
      );
      expect(setDomainMock).toHaveBeenCalled();
    });

    it('returns 403 when the role is not pm_admin/cam', async () => {
      requireRoleMock.mockImplementationOnce(() => {
        throw new ForbiddenError('Only property managers can manage the custom domain');
      });
      const res = await POST(postReq('/api/v1/pm/site/domain', { communityId: 1, domain: 'www.example.com' }));

      expect(res.status).toBe(403);
      expect(setDomainMock).not.toHaveBeenCalled();
    });

    it('returns 403 during demo grace', async () => {
      assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo is read-only'));
      const res = await POST(postReq('/api/v1/pm/site/domain', { communityId: 1, domain: 'www.example.com' }));

      expect(res.status).toBe(403);
      expect(setDomainMock).not.toHaveBeenCalled();
    });

    it('returns 403 when the plan lacks hasSiteCustomDomain', async () => {
      requirePlanFeatureMock.mockRejectedValueOnce(new ForbiddenError('Upgrade required'));
      const res = await POST(postReq('/api/v1/pm/site/domain', { communityId: 1, domain: 'www.example.com' }));

      expect(res.status).toBe(403);
      expect(setDomainMock).not.toHaveBeenCalled();
    });

    it('returns 409 when a domain is already configured', async () => {
      setDomainMock.mockRejectedValueOnce(
        new ConflictError('You already have a custom domain. Remove it first.'),
      );
      const res = await POST(postReq('/api/v1/pm/site/domain', { communityId: 1, domain: 'www.example.com' }));

      expect(res.status).toBe(409);
    });

    it('returns 400 for a missing domain field', async () => {
      const res = await POST(postReq('/api/v1/pm/site/domain', { communityId: 1 }));
      expect(res.status).toBe(400);
      expect(setDomainMock).not.toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it('returns 200 and removes the domain', async () => {
      const res = await DELETE(deleteReq({ communityId: 1 }));

      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: { ok: boolean } };
      expect(json.data).toEqual({ ok: true });
      expect(removeDomainMock).toHaveBeenCalledWith(1, 'pm-1');
    });

    it('returns 403 during demo grace', async () => {
      assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo is read-only'));
      const res = await DELETE(deleteReq({ communityId: 1 }));
      expect(res.status).toBe(403);
      expect(removeDomainMock).not.toHaveBeenCalled();
    });
  });

  describe('verify POST', () => {
    it('returns 200 with the refreshed state', async () => {
      const res = await VERIFY_POST(postReq('/api/v1/pm/site/domain/verify', { communityId: 1 }));

      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: typeof ACTIVE_STATE };
      expect(json.data).toEqual(ACTIVE_STATE);
      expect(verifyDomainMock).toHaveBeenCalledWith(1, 'pm-1');
      expect(requirePlanFeatureMock).toHaveBeenCalledWith(1, 'hasSiteCustomDomain');
    });

    it('returns 403 when the role is not pm_admin/cam', async () => {
      requireRoleMock.mockImplementationOnce(() => {
        throw new ForbiddenError('Only property managers can manage the custom domain');
      });
      const res = await VERIFY_POST(postReq('/api/v1/pm/site/domain/verify', { communityId: 1 }));
      expect(res.status).toBe(403);
      expect(verifyDomainMock).not.toHaveBeenCalled();
    });
  });
});
