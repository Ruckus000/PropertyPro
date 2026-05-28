import { describe, it, expect, vi, beforeEach } from 'vitest';

const { headersMock, resolveCommunityContextMock, listPublicDocumentsForSitemapMock, getReaderMock } = vi.hoisted(() => {
  const listPublicDocumentsForSitemapMock = vi.fn().mockResolvedValue([]);
  return {
    headersMock: vi.fn(),
    resolveCommunityContextMock: vi.fn(),
    listPublicDocumentsForSitemapMock,
    getReaderMock: vi.fn(() => ({
      listPublicDocumentsForSitemap: listPublicDocumentsForSitemapMock,
      // The other reader methods aren't called by sitemap.ts; stubbed so the
      // mock satisfies the PublicScopedReader interface shape if extended.
      listSiteBlocks: vi.fn(),
      listAnnouncements: vi.fn(),
      listDocuments: vi.fn(),
      listMeetings: vi.fn(),
      getContactInfo: vi.fn(),
      communityId: 42,
    })),
  };
});

vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('@propertypro/shared', async () => {
  const actual = await vi.importActual<typeof import('@propertypro/shared')>('@propertypro/shared');
  return { ...actual, resolveCommunityContext: resolveCommunityContextMock };
});
vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: getReaderMock,
}));

import sitemap from '@/app/sitemap';

describe('sitemap.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPublicDocumentsForSitemapMock.mockResolvedValue([]);
  });

  it('lists community public URLs on a subdomain host (no community id header → no doc URLs)', async () => {
    headersMock.mockResolvedValueOnce(new Headers({ host: 'sunset-condos.getpropertypro.com' }));
    resolveCommunityContextMock.mockReturnValueOnce({
      source: 'host_subdomain',
      tenantSlug: 'sunset-condos',
      isReservedSubdomain: false,
      communityId: null,
    });
    const result = await sitemap();
    expect(result).toHaveLength(4);
    expect(result[0]?.url).toBe('https://sunset-condos.getpropertypro.com/');
    expect(result[1]?.url).toBe('https://sunset-condos.getpropertypro.com/transparency');
    expect(result[2]?.url).toBe('https://sunset-condos.getpropertypro.com/notices');
    expect(result[3]?.url).toBe('https://sunset-condos.getpropertypro.com/request-access');
    // Reader is NOT consulted when the middleware-injected community id is missing.
    expect(listPublicDocumentsForSitemapMock).not.toHaveBeenCalled();
  });

  it('appends per-document URLs when middleware resolves an x-community-id (migration 0007)', async () => {
    headersMock.mockResolvedValueOnce(
      new Headers({ host: 'sunset-condos.getpropertypro.com', 'x-community-id': '42' }),
    );
    resolveCommunityContextMock.mockReturnValueOnce({
      source: 'host_subdomain',
      tenantSlug: 'sunset-condos',
      isReservedSubdomain: false,
      communityId: null,
    });
    listPublicDocumentsForSitemapMock.mockResolvedValueOnce([
      { id: 101, updatedAt: new Date('2026-02-01T00:00:00Z') },
      { id: 247, updatedAt: new Date('2026-03-15T00:00:00Z') },
    ]);

    const result = await sitemap();
    // 4 static + 2 documents = 6 entries.
    expect(result).toHaveLength(6);
    expect(result[4]?.url).toBe('https://sunset-condos.getpropertypro.com/api/v1/documents/101/download');
    expect(result[4]?.lastModified).toEqual(new Date('2026-02-01T00:00:00Z'));
    expect(result[5]?.url).toBe('https://sunset-condos.getpropertypro.com/api/v1/documents/247/download');
    // Reader is bound to the parsed numeric community id.
    expect(getReaderMock).toHaveBeenCalledWith(42);
    expect(listPublicDocumentsForSitemapMock).toHaveBeenCalledWith({ limit: 1000 });
  });

  it('ignores a malformed x-community-id and returns static entries only', async () => {
    headersMock.mockResolvedValueOnce(
      new Headers({ host: 'sunset-condos.getpropertypro.com', 'x-community-id': 'notanumber' }),
    );
    resolveCommunityContextMock.mockReturnValueOnce({
      source: 'host_subdomain',
      tenantSlug: 'sunset-condos',
      isReservedSubdomain: false,
      communityId: null,
    });
    const result = await sitemap();
    expect(result).toHaveLength(4);
    expect(listPublicDocumentsForSitemapMock).not.toHaveBeenCalled();
  });

  it('returns an empty sitemap on a reserved subdomain (e.g. pm.)', async () => {
    // Mirrors the robots.ts disallow-all branch. Reserved subdomains serve
    // authenticated apps; advertising a sitemap would leak dashboard URL
    // structure.
    headersMock.mockResolvedValueOnce(new Headers({ host: 'pm.getpropertypro.com' }));
    resolveCommunityContextMock.mockReturnValueOnce({
      source: 'host_subdomain',
      tenantSlug: 'pm',
      isReservedSubdomain: true,
      communityId: null,
    });
    const result = await sitemap();
    expect(result).toEqual([]);
  });

  it('lists marketing URLs on the root host', async () => {
    headersMock.mockResolvedValueOnce(new Headers({ host: 'getpropertypro.com' }));
    resolveCommunityContextMock.mockReturnValueOnce({
      source: 'none',
      tenantSlug: null,
      isReservedSubdomain: false,
      communityId: null,
    });
    const result = await sitemap();
    expect(result.some((e) => e.url.endsWith('/pricing'))).toBe(true);
    expect(result.some((e) => e.url.endsWith('/signup'))).toBe(true);
  });

  it('does NOT include /api/* or /pm/* in either branch', async () => {
    headersMock.mockResolvedValueOnce(new Headers({ host: 'sunset-condos.getpropertypro.com' }));
    resolveCommunityContextMock.mockReturnValueOnce({
      source: 'host_subdomain',
      tenantSlug: 'sunset-condos',
      isReservedSubdomain: false,
      communityId: null,
    });
    const result = await sitemap();
    for (const entry of result) {
      expect(entry.url).not.toMatch(/\/api\//);
      expect(entry.url).not.toMatch(/\/pm\//);
    }
  });
});
