import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

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
  resizeSiteLogo: resizeSiteLogoMock,
}));
vi.mock('file-type', () => ({
  fileTypeFromBuffer: fileTypeFromBufferMock,
}));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
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
      // Only the fields this route owns: never the look, the draft or settings.
      expect(json.data).toEqual({
        logoPath: null,
        logoUrl: null,
        siteLogoPath: null,
        siteLogoUrl: null,
        customEmailFooter: null,
      });
    });

    it('resolves each stored logo to a URL the editor can show', async () => {
      getBrandingForCommunityMock.mockResolvedValueOnce({
        logoPath: 'communities/1/branding/logo.webp',
        siteLogoPath: '1/site/wordmark.png',
        customEmailFooter: 'Office hours 9-5',
        draftLook: { primaryColor: '#000000' },
      });
      createPresignedDownloadUrlMock.mockResolvedValueOnce('https://storage/signed-logo');
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');

      const res = await GET(new NextRequest('http://localhost/api/v1/pm/branding?communityId=1'));

      const json = (await res.json()) as { data: unknown };
      expect(json.data).toEqual({
        logoPath: 'communities/1/branding/logo.webp',
        logoUrl: 'https://storage/signed-logo',
        siteLogoPath: '1/site/wordmark.png',
        siteLogoUrl: 'https://proj.supabase.co/storage/v1/object/public/community-assets/1/site/wordmark.png',
        customEmailFooter: 'Office hours 9-5',
      });
      vi.unstubAllEnvs();
    });

    it('returns 200 with empty object when no branding set', async () => {
      getBrandingForCommunityMock.mockResolvedValueOnce(null);
      const req = new NextRequest('http://localhost/api/v1/pm/branding?communityId=1');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: unknown };
      expect(json.data).toEqual({
        logoPath: null,
        logoUrl: null,
        siteLogoPath: null,
        siteLogoUrl: null,
        customEmailFooter: null,
      });
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
    // Since builder v4 the site's look is a draft saved via /pm/site/design,
    // so this route refuses every look field outright. The values below are
    // VALID (a real hex, an allowlisted font): the 400 comes from the body
    // being .strict(), not from a format check. Revert-check: drop .strict()
    // and each case returns 200 with the field silently stripped.
    it.each([
      ['primaryColor', '#aabbcc'],
      ['secondaryColor', '#112233'],
      ['accentColor', '#445566'],
      ['fontHeading', 'Lato'],
      ['fontBody', 'Lato'],
      ['customCssOverrides', { primaryColor: '#112233' }],
    ])('rejects the look field %s with 400 and writes nothing', async (field, value) => {
      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1, [field]: value }),
      });
      const res = await PATCH(req);

      expect(res.status).toBe(400);
      expect(updateBrandingForCommunityMock).not.toHaveBeenCalled();
      expect(logAuditEventMock).not.toHaveBeenCalled();
    });

    it('rejects a look field even alongside a valid live field', async () => {
      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1, customEmailFooter: 'Hi', primaryColor: '#aabbcc' }),
      });
      const res = await PATCH(req);

      expect(res.status).toBe(400);
      expect(updateBrandingForCommunityMock).not.toHaveBeenCalled();
    });

    it('updates the email footer and audits only the changed field', async () => {
      // The stored branding carries a manager's unpublished draft; none of it
      // belongs in this request's audit row.
      updateBrandingForCommunityMock.mockResolvedValueOnce({
        customEmailFooter: 'Questions? Call the office.',
        draftLook: { primaryColor: '#000000' },
      });
      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1, customEmailFooter: 'Questions? Call the office.' }),
      });
      const res = await PATCH(req);

      expect(res.status).toBe(200);
      expect(updateBrandingForCommunityMock).toHaveBeenCalledWith(1, {
        customEmailFooter: 'Questions? Call the office.',
      }, { remove: [] });
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'settings_changed',
          communityId: 1,
          newValues: { customEmailFooter: 'Questions? Call the office.' },
        }),
      );
    });

    it.each([
      ['logoStoragePath', 'logoPath'],
      ['siteLogoStoragePath', 'siteLogoPath'],
    ])('removes the logo when %s is null, and audits the removal', async (field, key) => {
      updateBrandingForCommunityMock.mockResolvedValueOnce({});
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const res = await PATCH(
        new NextRequest('http://localhost/api/v1/pm/branding', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId: 1, [field]: null }),
        }),
      );

      expect(res.status).toBe(200);
      expect(updateBrandingForCommunityMock).toHaveBeenCalledWith(1, {}, { remove: [key] });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ newValues: { [key]: null } }),
      );
      expect((await res.json()).data).toMatchObject({ [key]: null });
      vi.unstubAllGlobals();
    });

    it('passes an empty customEmailFooter through to clear the stored value', async () => {
      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1, customEmailFooter: '' }),
      });
      const res = await PATCH(req);

      expect(res.status).toBe(200);
      // '' must reach the persistence layer (not be dropped as undefined) so a
      // user clearing the footer actually wipes it. updateBrandingForCommunity
      // spreads the patch over existing branding, so '' overwrites the old text.
      expect(updateBrandingForCommunityMock).toHaveBeenCalledWith(1, {
        customEmailFooter: '',
      }, { remove: [] });
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
        body: JSON.stringify({ communityId: 1, customEmailFooter: 'Hi' }),
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

    // The copy runs with the service role, so a path the caller does not own
    // would land a private file from another community in this one's branding.
    it.each([
      ['logoStoragePath', 'communities/2/documents/u1/board-minutes.png'],
      ['siteLogoStoragePath', 'communities/2/documents/u1/board-minutes.png'],
      ['logoStoragePath', 'communities/1/documents/../../2/documents/u1/x.png'],
      ['logoStoragePath', 'communities/1/esign-signed/u1/x.png'],
    ])('rejects %s %s without reading or writing storage', async (field, path) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const req = new NextRequest('http://localhost/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1, [field]: path }),
      });
      const res = await PATCH(req);

      expect(res.status).toBe(400);
      expect(createPresignedDownloadUrlMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(updateBrandingForCommunityMock).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
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
        body: JSON.stringify({ communityId: 1, logoStoragePath: 'communities/1/documents/u1/logo.gif' }),
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
        body: JSON.stringify({ communityId: 1, siteLogoStoragePath: 'communities/1/documents/u2/site-logo.png' }),
      });
      const res = await PATCH(req);

      expect(res.status).toBe(200);
      expect(resizeSiteLogoMock).toHaveBeenCalledTimes(1);
      expect(resizeLogoMock).not.toHaveBeenCalled();
      expect(updateBrandingForCommunityMock).toHaveBeenCalledWith(1, {
        siteLogoPath: 'communities/1/branding/site-logo.webp',
      }, { remove: [] });

      vi.unstubAllGlobals();
    });
  });
});
