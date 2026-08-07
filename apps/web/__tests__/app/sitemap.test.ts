import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  headersMock,
  resolveCommunityContextMock,
  listPublicDocumentsForSitemapMock,
  listPublishedPagesForSitemapMock,
  getReaderMock,
  getBrandingForCommunityMock,
} = vi.hoisted(() => {
  const listPublicDocumentsForSitemapMock = vi.fn().mockResolvedValue([]);
  const listPublishedPagesForSitemapMock = vi.fn().mockResolvedValue([]);
  return {
    headersMock: vi.fn(),
    resolveCommunityContextMock: vi.fn(),
    listPublicDocumentsForSitemapMock,
    listPublishedPagesForSitemapMock,
    getBrandingForCommunityMock: vi.fn().mockResolvedValue(null),
    getReaderMock: vi.fn(() => ({
      listPublicDocumentsForSitemap: listPublicDocumentsForSitemapMock,
      listPublishedPagesForSitemap: listPublishedPagesForSitemapMock,
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
// Phase 8. Mocked for the same reason as the reader above: importing the real
// module pulls `@propertypro/db/unsafe` → drizzle, which throws at module load
// without DATABASE_URL — green locally against the real database, red in the
// DB-less CI unit job. Repro with `env -u DATABASE_URL pnpm test`.
vi.mock('@/lib/api/branding', () => ({
  getBrandingForCommunity: getBrandingForCommunityMock,
}));

import sitemap from '@/app/sitemap';

describe('sitemap.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPublicDocumentsForSitemapMock.mockResolvedValue([]);
    listPublishedPagesForSitemapMock.mockResolvedValue([]);
    getBrandingForCommunityMock.mockResolvedValue(null);
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
    expect(result).toHaveLength(2);
    expect(result[0]?.url).toBe('https://sunset-condos.getpropertypro.com/');
    expect(result[1]?.url).toBe('https://sunset-condos.getpropertypro.com/transparency');
    // Reader is NOT consulted when the middleware-injected community id is missing.
    expect(listPublicDocumentsForSitemapMock).not.toHaveBeenCalled();
  });

  it('does not advertise /notices or /request-access — neither renders on a tenant host', async () => {
    // Regression. Both were static entries until this was fixed, and both 404 on
    // a community subdomain AND a verified custom domain: their renderers live at
    // `app/(public)/[subdomain]/<suffix>` and need a `[subdomain]` PATH segment,
    // which a host carrying tenancy implicitly never supplies. `transparency` is
    // the only suffix with a host-native twin (`app/public-transparency`).
    headersMock.mockResolvedValueOnce(new Headers({ host: 'sunset-condos.getpropertypro.com' }));
    resolveCommunityContextMock.mockReturnValueOnce({
      source: 'host_subdomain',
      tenantSlug: 'sunset-condos',
      isReservedSubdomain: false,
      communityId: null,
    });
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).not.toContain('https://sunset-condos.getpropertypro.com/notices');
    expect(urls).not.toContain('https://sunset-condos.getpropertypro.com/request-access');
    expect(urls).toContain('https://sunset-condos.getpropertypro.com/transparency');
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
    // 2 static + 2 documents = 4 entries.
    expect(result).toHaveLength(4);
    expect(result[2]?.url).toBe('https://sunset-condos.getpropertypro.com/api/v1/documents/101/download');
    expect(result[2]?.lastModified).toEqual(new Date('2026-02-01T00:00:00Z'));
    expect(result[3]?.url).toBe('https://sunset-condos.getpropertypro.com/api/v1/documents/247/download');
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
    expect(result).toHaveLength(2);
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
    expect(result.some((e) => e.url.endsWith('/signup'))).toBe(true);
    expect(result.some((e) => e.url.endsWith('/resources'))).toBe(true);
    expect(result.some((e) => e.url.endsWith('/transparency'))).toBe(true);
    expect(result.some((e) => e.url.endsWith('/contact'))).toBe(true);
  });

  it('does not advertise /pricing, which is a fragment and not a route', async () => {
    // It was listed here for months. There is no `(marketing)/pricing` page —
    // pricing is the `#pricing` anchor on `/` — so the URL resolved to a 308
    // into a community subdomain that does not exist.
    headersMock.mockResolvedValueOnce(new Headers({ host: 'getpropertypro.com' }));
    resolveCommunityContextMock.mockReturnValueOnce({
      source: 'none',
      tenantSlug: null,
      isReservedSubdomain: false,
      communityId: null,
    });
    const result = await sitemap();
    expect(result.some((e) => e.url.endsWith('/pricing'))).toBe(false);
  });

  it('stamps each resource article with its own updatedAt, not the crawl time', async () => {
    headersMock.mockResolvedValueOnce(new Headers({ host: 'getpropertypro.com' }));
    resolveCommunityContextMock.mockReturnValueOnce({
      source: 'none',
      tenantSlug: null,
      isReservedSubdomain: false,
      communityId: null,
    });
    const result = await sitemap();
    const articles = result.filter((e) => /\/resources\/.+/.test(e.url));
    expect(articles.length).toBeGreaterThan(0);
    // All-identical `now` timestamps would tell crawlers the whole corpus
    // changes on every fetch.
    const home = result.find((e) => e.url.endsWith('getpropertypro.com/'));
    for (const article of articles) {
      expect(article.lastModified).not.toEqual(home?.lastModified);
    }
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

  /**
   * Website editor v3, Phase 8 — the search-indexing opt-out.
   *
   * The sitemap is the signal actively soliciting a crawl, so a community that
   * has opted out lists nothing. `robots.ts` still ALLOWS these paths on
   * purpose — see the comment in sitemap.ts — and `robots.test.ts` pins that.
   */
  describe('search-indexing opt-out', () => {
    function subdomainHost() {
      headersMock.mockResolvedValueOnce(
        new Headers({ host: 'sunset-condos.getpropertypro.com', 'x-community-id': '42' }),
      );
      resolveCommunityContextMock.mockReturnValueOnce({
        source: 'host_subdomain',
        tenantSlug: 'sunset-condos',
        isReservedSubdomain: false,
        communityId: 42,
      });
    }

    it('lists nothing when the PM has opted out', async () => {
      subdomainHost();
      getBrandingForCommunityMock.mockResolvedValue({ siteSettings: { searchIndexing: false } });
      expect(await sitemap()).toEqual([]);
    });

    it('lists the community pages when indexing is on', async () => {
      subdomainHost();
      getBrandingForCommunityMock.mockResolvedValue({ siteSettings: { searchIndexing: true } });
      expect((await sitemap()).length).toBeGreaterThan(0);
    });

    // The default. A community that never touched the setting must keep being
    // listed — the failure here is silent and takes months of recrawl to undo.
    it.each([
      ['no branding at all', null],
      ['branding with no siteSettings', {}],
      ['a malformed siteSettings', { siteSettings: 'nope' }],
      ['the string "false"', { siteSettings: { searchIndexing: 'false' } }],
    ])('still lists the community for %s', async (_label, branding) => {
      subdomainHost();
      getBrandingForCommunityMock.mockResolvedValue(branding);
      expect((await sitemap()).length).toBeGreaterThan(0);
    });

    it('does not consult branding on the marketing root', async () => {
      headersMock.mockResolvedValueOnce(new Headers({ host: 'getpropertypro.com' }));
      resolveCommunityContextMock.mockReturnValueOnce({
        source: 'none',
        tenantSlug: null,
        isReservedSubdomain: false,
        communityId: null,
      });
      await sitemap();
      expect(getBrandingForCommunityMock).not.toHaveBeenCalled();
    });
  });

  /**
   * Phase 11b-2, S7. Two pre-existing production bugs, one root cause: this
   * route called `resolveCommunityContext({ host })` with NO `rootDomain`.
   * `foreignHost()` (subdomain-router.ts) short-circuits on
   * `if (!host || !rootDomain) return null`, so `source: 'custom_domain'` was
   * literally unreachable and a verified custom domain fell through to the
   * subdomain/marketing branches.
   *
   * The other cases in this file mock `resolveCommunityContext` with hardcoded
   * return values, which makes the fix invisible to them by construction — so
   * the ARGUMENT is asserted here.
   */
  describe('host resolution (custom domains)', () => {
    it('passes a rootDomain to resolveCommunityContext, without which custom_domain is unreachable', async () => {
      headersMock.mockResolvedValueOnce(new Headers({ host: 'www.sunsetcondos.org' }));
      resolveCommunityContextMock.mockReturnValueOnce({
        source: 'custom_domain',
        tenantSlug: null,
        isReservedSubdomain: false,
        communityId: null,
        customDomainHost: 'www.sunsetcondos.org',
      });
      await sitemap();
      expect(resolveCommunityContextMock).toHaveBeenCalledWith(
        expect.objectContaining({ rootDomain: expect.any(String) }),
      );
    });

    it('emits community URLs on a custom domain (was: classified as a reserved www subdomain → [])', async () => {
      headersMock.mockResolvedValueOnce(new Headers({ host: 'www.sunsetcondos.org' }));
      resolveCommunityContextMock.mockReturnValueOnce({
        source: 'custom_domain',
        tenantSlug: null,
        isReservedSubdomain: false,
        communityId: null,
        customDomainHost: 'www.sunsetcondos.org',
      });
      const result = await sitemap();
      expect(result).toHaveLength(2);
      expect(result[0]?.url).toBe('https://www.sunsetcondos.org/');
      expect(result[1]?.url).toBe('https://www.sunsetcondos.org/transparency');
      // And NOT PropertyPro's own marketing URLs under the community's domain.
      expect(result.some((e) => e.url.endsWith('/pricing'))).toBe(false);
      expect(result.some((e) => e.url.endsWith('/signup'))).toBe(false);
    });

    it('appends per-page and per-document URLs on a custom domain', async () => {
      headersMock.mockResolvedValueOnce(
        new Headers({ host: 'sunsetcondos.org', 'x-community-id': '42' }),
      );
      resolveCommunityContextMock.mockReturnValueOnce({
        source: 'custom_domain',
        tenantSlug: null,
        isReservedSubdomain: false,
        communityId: null,
        customDomainHost: 'sunsetcondos.org',
      });
      listPublishedPagesForSitemapMock.mockResolvedValueOnce([
        { id: 7, slug: 'about', updatedAt: new Date('2026-05-01T00:00:00Z') },
      ]);
      const result = await sitemap();
      expect(result.map((e) => e.url)).toContain('https://sunsetcondos.org/about');
      expect(getReaderMock).toHaveBeenCalledWith(42);
    });
  });

  /**
   * Phase 11b-2, S7 — one entry per published page (D16). `in_nav` is
   * presentation, not indexability, so the reader deliberately does not filter
   * on it; that predicate lives in (and is tested by) the reader.
   */
  describe('published site pages', () => {
    function subdomainWithCommunityId() {
      headersMock.mockResolvedValueOnce(
        new Headers({ host: 'sunset-condos.getpropertypro.com', 'x-community-id': '42' }),
      );
      resolveCommunityContextMock.mockReturnValueOnce({
        source: 'host_subdomain',
        tenantSlug: 'sunset-condos',
        isReservedSubdomain: false,
        communityId: null,
      });
    }

    it('emits one URL per published page, after the static entries', async () => {
      subdomainWithCommunityId();
      listPublishedPagesForSitemapMock.mockResolvedValueOnce([
        { id: 7, slug: 'about', updatedAt: new Date('2026-05-01T00:00:00Z') },
        { id: 9, slug: 'amenities', updatedAt: new Date('2026-05-02T00:00:00Z') },
      ]);
      const result = await sitemap();
      expect(result).toHaveLength(4);
      expect(result[2]?.url).toBe('https://sunset-condos.getpropertypro.com/about');
      expect(result[2]?.lastModified).toEqual(new Date('2026-05-01T00:00:00Z'));
      expect(result[3]?.url).toBe('https://sunset-condos.getpropertypro.com/amenities');
    });

    it('caps the page listing at 200 (D16)', async () => {
      subdomainWithCommunityId();
      await sitemap();
      expect(listPublishedPagesForSitemapMock).toHaveBeenCalledWith({ limit: 200 });
    });

    // NOTE the narrow scope, and do not widen the title back. This asserts that
    // sitemap.ts adds no `/` of its own beyond the static entry — it CANNOT
    // observe that the reader excludes home, because the reader is mocked here
    // and the mock simply never returns a home row. The real guarantee
    // (`isHome = false` in the WHERE) is asserted in
    // __tests__/lib/db/public-community-reader.test.ts.
    it('adds no second `/` entry alongside the static one', async () => {
      subdomainWithCommunityId();
      listPublishedPagesForSitemapMock.mockResolvedValueOnce([
        { id: 7, slug: 'about', updatedAt: new Date('2026-05-01T00:00:00Z') },
      ]);
      const result = await sitemap();
      const roots = result.filter((e) => e.url === 'https://sunset-condos.getpropertypro.com/');
      expect(roots).toHaveLength(1);
    });

    it('lists no pages at all when the community has opted out of indexing', async () => {
      subdomainWithCommunityId();
      getBrandingForCommunityMock.mockResolvedValue({ siteSettings: { searchIndexing: false } });
      listPublishedPagesForSitemapMock.mockResolvedValueOnce([
        { id: 7, slug: 'about', updatedAt: new Date('2026-05-01T00:00:00Z') },
      ]);
      expect(await sitemap()).toEqual([]);
      // The opt-out short-circuits before the reader is ever consulted.
      expect(listPublishedPagesForSitemapMock).not.toHaveBeenCalled();
    });
  });
});
