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
  fileTypeFromBufferMock,
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
  fileTypeFromBufferMock: vi.fn(),
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
}));
vi.mock('file-type', () => ({
  fileTypeFromBuffer: fileTypeFromBufferMock,
}));


vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));
import { GET, PATCH } from '../../src/app/api/v1/pm/branding/route';

const PM_MEMBERSHIP = { role: 'pm_admin', isAdmin: true, isUnitOwner: false, displayTitle: 'Property Manager Admin', communityId: 1, userId: 'pm-1', communityType: 'condo_718' };

describe('pm branding route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('pm-1');
    requireCommunityMembershipMock.mockResolvedValue(PM_MEMBERSHIP);
    resolveEffectiveCommunityIdMock.mockImplementation((_: unknown, id: number) => id);
    getBrandingForCommunityMock.mockResolvedValue({ primaryColor: '#1a56db' });
    updateBrandingForCommunityMock.mockResolvedValue({ primaryColor: '#aabbcc' });
    logAuditEventMock.mockResolvedValue(undefined);
    // Default: valid PNG magic bytes detected
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
      requireCommunityMembershipMock.mockResolvedValueOnce({ ...PM_MEMBERSHIP, role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner' });
      const req = new NextRequest('http://localhost/api/v1/pm/branding?communityId=1');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it('returns 401 for unauthenticated user', async () => {
      requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
      const req = new NextRequest('http://localhost/api/v1/pm/branding?communityId=1');
      const res = await GET(req);
      expect(res.status).toBe(401);
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

    it('returns 403 for non-PM user', async () => {
      requireCommunityMembershipMock.mockResolvedValueOnce({ ...PM_MEMBERSHIP, role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board Member', presetKey: 'board_member', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } } });
      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1, primaryColor: '#aabbcc' }),
      });
      const res = await PATCH(req);

      expect(res.status).toBe(403);
      expect(updateBrandingForCommunityMock).not.toHaveBeenCalled();
    });

    it('returns 401 for unauthenticated user', async () => {
      requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1 }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(401);
    });

    it('returns 400 when logo storage bytes fail magic byte validation', async () => {
      // Simulate: storage returns bytes, but they are not a valid image type
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
  });
});
