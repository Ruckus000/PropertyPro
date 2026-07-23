import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  getBrandingForCommunityMock,
  updateBrandingForCommunityMock,
  createPresignedDownloadUrlMock,
  createPresignedUploadUrlMock,
  logAuditEventMock,
  resizeLogoMock,
  resizeSiteLogoMock,
  fileTypeFromBufferMock,
  assertNotDemoGraceMock,
  requirePlanFeatureMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn((_, id: number) => id),
  getBrandingForCommunityMock: vi.fn(),
  updateBrandingForCommunityMock: vi.fn(),
  createPresignedDownloadUrlMock: vi.fn(),
  createPresignedUploadUrlMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  resizeLogoMock: vi.fn(),
  resizeSiteLogoMock: vi.fn(),
  fileTypeFromBufferMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn().mockResolvedValue(undefined),
  requirePlanFeatureMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/middleware/read-entitlement-guard', () => ({ requireEntitledForAdminRead: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));
vi.mock('@/lib/api/branding', () => ({
  getBrandingForCommunity: getBrandingForCommunityMock,
  updateBrandingForCommunity: updateBrandingForCommunityMock,
}));
vi.mock('@propertypro/db', () => ({
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
  createPresignedUploadUrl: createPresignedUploadUrlMock,
  logAuditEvent: logAuditEventMock,
}));
vi.mock('@/lib/services/image-processor', () => ({
  resizeLogo: resizeLogoMock,
  resizeSiteLogo: resizeSiteLogoMock,
}));
vi.mock('file-type', () => ({
  fileTypeFromBuffer: fileTypeFromBufferMock,
}));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));
vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));
vi.mock('@/lib/services/onboarding-checklist-service', () => ({
  tryAutoComplete: vi.fn(),
}));

import { GET, PATCH } from '../../src/app/api/v1/pm/branding/route';

const PM_MEMBERSHIP = {
  role: 'property_manager',
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Property Manager',
  communityId: 1,
  userId: 'pm-1',
  communityType: 'condo_718',
};

describe('pm branding route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('pm-1');
    requireCommunityMembershipMock.mockResolvedValue(PM_MEMBERSHIP);
    resolveEffectiveCommunityIdMock.mockImplementation((_: unknown, id: number) => id);
    getBrandingForCommunityMock.mockResolvedValue({ primaryColor: '#1a56db' });
    updateBrandingForCommunityMock.mockResolvedValue({ primaryColor: '#aabbcc' });
    logAuditEventMock.mockResolvedValue(undefined);
    fileTypeFromBufferMock.mockResolvedValue({ mime: 'image/png', ext: 'png' });
  });

  describe('GET', () => {
    it('returns 200 with current branding for PM user', async () => {
      const req = new NextRequest('http://localhost/api/v1/pm/branding?communityId=1');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: unknown };
      expect(json.data).toEqual({ primaryColor: '#1a56db' });
    });

    it('returns 200 with empty object when no branding set', async () => {
      getBrandingForCommunityMock.mockResolvedValueOnce(null);
      const req = new NextRequest('http://localhost/api/v1/pm/branding?communityId=1');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: unknown };
      expect(json.data).toEqual({});
    });

    it('returns 403 for non-PM user', async () => {
      requireCommunityMembershipMock.mockResolvedValueOnce({
        ...PM_MEMBERSHIP,
        role: 'resident',
        isAdmin: false,
        isUnitOwner: true,
        displayTitle: 'Owner',
      });
      const req = new NextRequest('http://localhost/api/v1/pm/branding?communityId=1');
      const res = await GET(req);
      expect(res.status).toBe(403);
      expect(getBrandingForCommunityMock).not.toHaveBeenCalled();
    });

    it('returns 401 for unauthenticated user', async () => {
      requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
      const req = new NextRequest('http://localhost/api/v1/pm/branding?communityId=1');
      const res = await GET(req);
      expect(res.status).toBe(401);
      expect(getBrandingForCommunityMock).not.toHaveBeenCalled();
    });

    it('returns 400 for missing communityId', async () => {
      const req = new NextRequest('http://localhost/api/v1/pm/branding');
      const res = await GET(req);
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH', () => {
    it('updates branding colors and logs audit event', async () => {
      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1, primaryColor: '#aabbcc', secondaryColor: '#112233' }),
      });
      const res = await PATCH(req);

      expect(res.status).toBe(200);
      expect(updateBrandingForCommunityMock).toHaveBeenCalledWith(1, {
        primaryColor: '#aabbcc',
        secondaryColor: '#112233',
      });
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'settings_changed', communityId: 1 }),
      );
    });

    it('returns 400 for invalid hex color', async () => {
      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1, primaryColor: 'red' }),
      });
      const res = await PATCH(req);

      expect(res.status).toBe(400);
      expect(updateBrandingForCommunityMock).not.toHaveBeenCalled();
    });

    it('persists customCssOverrides and enforces hasSiteCustomCss', async () => {
      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 1,
          customCssOverrides: { primaryColor: '#112233', bodyFont: 'Lato' },
        }),
      });
      const res = await PATCH(req);

      expect(res.status).toBe(200);
      expect(requirePlanFeatureMock).toHaveBeenCalledWith(1, 'hasSiteCustomCss');
      expect(updateBrandingForCommunityMock).toHaveBeenCalledWith(1, {
        customCssOverrides: { primaryColor: '#112233', bodyFont: 'Lato' },
      });
    });

    it('returns 403 when the plan lacks hasSiteCustomCss', async () => {
      requirePlanFeatureMock.mockRejectedValueOnce(new ForbiddenError('Upgrade required'));
      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1, customCssOverrides: { primaryColor: '#112233' } }),
      });
      const res = await PATCH(req);

      expect(res.status).toBe(403);
      expect(updateBrandingForCommunityMock).not.toHaveBeenCalled();
    });

    it('rejects an unknown key inside customCssOverrides (strict — no raw CSS)', async () => {
      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 1,
          customCssOverrides: { primaryColor: '#112233', rawCss: 'body{display:none}' },
        }),
      });
      const res = await PATCH(req);

      expect(res.status).toBe(400);
      expect(requirePlanFeatureMock).not.toHaveBeenCalled();
      expect(updateBrandingForCommunityMock).not.toHaveBeenCalled();
    });

    it('rejects an invalid hex inside customCssOverrides', async () => {
      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1, customCssOverrides: { accentColor: 'red' } }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(400);
      expect(updateBrandingForCommunityMock).not.toHaveBeenCalled();
    });

    it('rejects a non-allowlisted bodyFont inside customCssOverrides', async () => {
      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1, customCssOverrides: { bodyFont: 'Comic Sans MS' } }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(400);
      expect(updateBrandingForCommunityMock).not.toHaveBeenCalled();
    });

    it('clears overrides with null (still gated)', async () => {
      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1, customCssOverrides: null }),
      });
      const res = await PATCH(req);

      expect(res.status).toBe(200);
      expect(requirePlanFeatureMock).toHaveBeenCalledWith(1, 'hasSiteCustomCss');
      expect(updateBrandingForCommunityMock).toHaveBeenCalledWith(1, { customCssOverrides: null });
    });

    it('does NOT gate a plain color PATCH on hasSiteCustomCss', async () => {
      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1, primaryColor: '#aabbcc' }),
      });
      await PATCH(req);
      expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    });

    it('returns 403 for non-PM user — demo grace runs but update does not', async () => {
      requireCommunityMembershipMock.mockResolvedValueOnce({
        ...PM_MEMBERSHIP,
        role: 'resident',
        isAdmin: false,
        isUnitOwner: true,
      });
      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1, primaryColor: '#aabbcc' }),
      });
      const res = await PATCH(req);

      expect(res.status).toBe(403);
      expect(assertNotDemoGraceMock).toHaveBeenCalled();
      expect(updateBrandingForCommunityMock).not.toHaveBeenCalled();
    });

    it('returns 401 without calling demo grace or update', async () => {
      requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1 }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(401);
      expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
      expect(updateBrandingForCommunityMock).not.toHaveBeenCalled();
    });

    it('returns 400 when logo storage bytes fail magic byte validation', async () => {
      createPresignedDownloadUrlMock.mockResolvedValueOnce('http://storage/raw-logo');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(8),
        }),
      );
      fileTypeFromBufferMock.mockResolvedValueOnce({ mime: 'image/gif', ext: 'gif' });

      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1, logoStoragePath: 'uploads/raw/logo.gif' }),
      });
      const res = await PATCH(req);

      expect(res.status).toBe(400);
      expect(resizeLogoMock).not.toHaveBeenCalled();
      expect(updateBrandingForCommunityMock).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('processes a site logo via resizeSiteLogo and persists siteLogoPath', async () => {
      createPresignedDownloadUrlMock.mockResolvedValueOnce('http://storage/raw-site-logo');
      createPresignedUploadUrlMock.mockResolvedValueOnce({ signedUrl: 'http://storage/put-site-logo' });
      fileTypeFromBufferMock.mockResolvedValueOnce({ mime: 'image/png', ext: 'png' });
      resizeSiteLogoMock.mockResolvedValueOnce(Buffer.from('processed-wordmark'));
      vi.stubGlobal(
        'fetch',
        vi.fn()
          // GET the raw upload
          .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
          // PUT the processed webp
          .mockResolvedValueOnce({ ok: true }),
      );

      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1, siteLogoStoragePath: 'uploads/raw/site-logo.png' }),
      });
      const res = await PATCH(req);

      expect(res.status).toBe(200);
      expect(resizeSiteLogoMock).toHaveBeenCalledTimes(1);
      expect(resizeLogoMock).not.toHaveBeenCalled();
      expect(updateBrandingForCommunityMock).toHaveBeenCalledWith(1, {
        siteLogoPath: 'communities/1/branding/site-logo.webp',
      });

      vi.unstubAllGlobals();
    });
  });
});
