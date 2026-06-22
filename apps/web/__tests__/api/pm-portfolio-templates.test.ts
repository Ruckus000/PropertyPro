import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireRoleMock,
  isPmAdminInAnyCommunityMock,
  userHasAccessMock,
  listTemplatesMock,
  createFromCommunityMock,
  renameTemplateMock,
  deleteTemplateMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireRoleMock: vi.fn(),
  isPmAdminInAnyCommunityMock: vi.fn(),
  userHasAccessMock: vi.fn(),
  listTemplatesMock: vi.fn(),
  createFromCommunityMock: vi.fn(),
  renameTemplateMock: vi.fn(),
  deleteTemplateMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthenticatedUserIdMock }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: requireCommunityMembershipMock }));
vi.mock('@/lib/api/role-guard', () => ({ requireRole: requireRoleMock, PM_MANAGER_ROLES: ['property_manager', 'root_manager'] }));
vi.mock('@/lib/api/pm-communities', () => ({ isPmAdminInAnyCommunity: isPmAdminInAnyCommunityMock }));
vi.mock('@/lib/services/site-portfolio-template-service', () => ({
  userHasPortfolioTemplatesAccess: userHasAccessMock,
  listTemplates: listTemplatesMock,
  createFromCommunity: createFromCommunityMock,
  renameTemplate: renameTemplateMock,
  deleteTemplate: deleteTemplateMock,
}));

import { GET, POST, PATCH, DELETE } from '../../src/app/api/v1/pm/portfolio/templates/route';

const SUMMARY = {
  id: 11,
  name: 'Coastal',
  siteLogoPath: 'portfolio-templates/11/site-logo.webp',
  createdAt: '2026-02-03T04:05:06.000Z',
  updatedAt: '2026-02-03T04:05:06.000Z',
  branding: { primaryColor: '#111' },
};

function bodyReq(method: string, body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/portfolio/templates', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('pm portfolio templates route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('pm-1');
    isPmAdminInAnyCommunityMock.mockResolvedValue(true);
    userHasAccessMock.mockResolvedValue(true);
    requireCommunityMembershipMock.mockResolvedValue({ role: 'pm_admin', communityId: 7 });
    requireRoleMock.mockReturnValue(undefined);
    listTemplatesMock.mockResolvedValue([SUMMARY]);
    createFromCommunityMock.mockResolvedValue(SUMMARY);
    renameTemplateMock.mockResolvedValue({ ...SUMMARY, name: 'Renamed' });
    deleteTemplateMock.mockResolvedValue(undefined);
  });

  describe('gate', () => {
    it('403 when the user is not a PM in any community', async () => {
      isPmAdminInAnyCommunityMock.mockResolvedValueOnce(false);
      const res = await GET(new NextRequest('http://localhost/api/v1/pm/portfolio/templates'));
      expect(res.status).toBe(403);
      expect(listTemplatesMock).not.toHaveBeenCalled();
    });

    it('403 PLAN_UPGRADE_REQUIRED when the user lacks the feature', async () => {
      userHasAccessMock.mockResolvedValueOnce(false);
      const res = await GET(new NextRequest('http://localhost/api/v1/pm/portfolio/templates'));
      expect(res.status).toBe(403);
      const json = (await res.json()) as { error: { code: string } };
      expect(json.error.code).toBe('PLAN_UPGRADE_REQUIRED');
    });
  });

  describe('GET', () => {
    it('returns the templates list', async () => {
      const res = await GET(new NextRequest('http://localhost/api/v1/pm/portfolio/templates'));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: { templates: unknown[] } };
      expect(json.data.templates).toHaveLength(1);
      expect(listTemplatesMock).toHaveBeenCalledWith('pm-1');
    });
  });

  describe('POST', () => {
    it('creates from a community after verifying source membership', async () => {
      const res = await POST(bodyReq('POST', { communityId: 7, name: 'Coastal' }));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: typeof SUMMARY };
      expect(json.data).toEqual(SUMMARY);
      expect(requireCommunityMembershipMock).toHaveBeenCalledWith(7, 'pm-1');
      expect(requireRoleMock).toHaveBeenCalled();
      expect(createFromCommunityMock).toHaveBeenCalledWith('pm-1', 7, 'Coastal');
    });

    it('403 when the caller does not manage the source community', async () => {
      requireRoleMock.mockImplementationOnce(() => {
        throw new ForbiddenError('You do not manage that community');
      });
      const res = await POST(bodyReq('POST', { communityId: 7, name: 'Coastal' }));
      expect(res.status).toBe(403);
      expect(createFromCommunityMock).not.toHaveBeenCalled();
    });
  });

  describe('PATCH', () => {
    it('renames a template', async () => {
      const res = await PATCH(bodyReq('PATCH', { id: 11, name: 'Renamed' }));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: { name: string } };
      expect(json.data.name).toBe('Renamed');
      expect(renameTemplateMock).toHaveBeenCalledWith('pm-1', 11, 'Renamed');
    });
  });

  describe('DELETE', () => {
    it('deletes a template and returns ok', async () => {
      const res = await DELETE(bodyReq('DELETE', { id: 11 }));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: { ok: boolean } };
      expect(json.data.ok).toBe(true);
      expect(deleteTemplateMock).toHaveBeenCalledWith('pm-1', 11);
    });
  });
});
