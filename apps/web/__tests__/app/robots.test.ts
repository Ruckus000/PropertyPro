import { describe, it, expect, vi, beforeEach } from 'vitest';

const { headersMock, resolveCommunityContextMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  resolveCommunityContextMock: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('@propertypro/shared', async () => {
  const actual = await vi.importActual<typeof import('@propertypro/shared')>('@propertypro/shared');
  return { ...actual, resolveCommunityContext: resolveCommunityContextMock };
});

import robots from '@/app/robots';

describe('robots.ts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows public pages and disallows authenticated paths on a community subdomain', async () => {
    headersMock.mockResolvedValueOnce(new Headers({ host: 'sunset-condos.getpropertypro.com' }));
    resolveCommunityContextMock.mockReturnValueOnce({
      source: 'host_subdomain',
      tenantSlug: 'sunset-condos',
      isReservedSubdomain: false,
      communityId: null,
    });
    const result = await robots();
    // Phase 11b-2 (D15): page slugs are dynamic, so the fixed four-path allow
    // list became `allow: '/'`. The disallow list is unchanged.
    expect(result.rules).toEqual([
      expect.objectContaining({
        userAgent: '*',
        allow: '/',
        disallow: ['/auth/', '/dashboard/', '/pm/', '/api/'],
      }),
    ]);
    expect(result.sitemap).toBe('https://sunset-condos.getpropertypro.com/sitemap.xml');
  });

  it('does NOT disallow anything for the search-indexing opt-out', async () => {
    // Load-bearing: a Disallow stops the crawler fetching the page, so it never
    // reads `noindex` — and an already-indexed URL persists indefinitely. The
    // opt-out is a sitemap/meta concern only. See sitemap.ts's comment.
    headersMock.mockResolvedValueOnce(new Headers({ host: 'sunset-condos.getpropertypro.com' }));
    resolveCommunityContextMock.mockReturnValueOnce({
      source: 'host_subdomain',
      tenantSlug: 'sunset-condos',
      isReservedSubdomain: false,
      communityId: null,
    });
    const result = await robots();
    expect((result.rules as Array<{ disallow: string[] }>)[0]?.disallow).toEqual([
      '/auth/',
      '/dashboard/',
      '/pm/',
      '/api/',
    ]);
  });

  it('returns the marketing-root policy on the root host', async () => {
    headersMock.mockResolvedValueOnce(new Headers({ host: 'getpropertypro.com' }));
    resolveCommunityContextMock.mockReturnValueOnce({
      source: 'none',
      tenantSlug: null,
      isReservedSubdomain: false,
      communityId: null,
    });
    const result = await robots();
    expect(result.rules).toEqual([
      expect.objectContaining({
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/pm/'],
      }),
    ]);
  });

  it('disallows ALL crawling on a reserved subdomain (e.g. pm.)', async () => {
    // Reserved subdomains serve authenticated apps (PM dashboard). The
    // dashboard requires auth so content is protected, but indexing URL
    // structure leaks dashboard route shape to search engines and adversaries.
    // Before the fix this fell through to the marketing-root branch and
    // emitted `allow: '/'` — see PR #500 /review HIGH finding.
    headersMock.mockResolvedValueOnce(new Headers({ host: 'pm.getpropertypro.com' }));
    resolveCommunityContextMock.mockReturnValueOnce({
      source: 'host_subdomain',
      tenantSlug: 'pm',
      isReservedSubdomain: true,
      communityId: null,
    });
    const result = await robots();
    expect(result.rules).toEqual([{ userAgent: '*', disallow: '/' }]);
    // Reserved subdomains intentionally do NOT advertise a sitemap.
    expect(result.sitemap).toBeUndefined();
  });

  /**
   * Phase 11b-2, S8. `resolveCommunityContext({ host })` was called with NO
   * `rootDomain`; `foreignHost()` returns null without it, so
   * `source: 'custom_domain'` was unreachable and `www.example.com` resolved as
   * a RESERVED `www` subdomain — i.e. a verified custom domain served
   * `disallow: '/'` and blocked all crawling of the community's own site.
   *
   * Every other case here mocks `resolveCommunityContext` with a hardcoded
   * return, so the fix is invisible to them by construction — hence the
   * argument assertion.
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
      await robots();
      expect(resolveCommunityContextMock).toHaveBeenCalledWith(
        expect.objectContaining({ rootDomain: expect.any(String) }),
      );
    });

    it('returns the community rules on a custom domain, NOT disallow-all', async () => {
      headersMock.mockResolvedValueOnce(new Headers({ host: 'www.sunsetcondos.org' }));
      resolveCommunityContextMock.mockReturnValueOnce({
        source: 'custom_domain',
        tenantSlug: null,
        isReservedSubdomain: false,
        communityId: null,
        customDomainHost: 'www.sunsetcondos.org',
      });
      const result = await robots();
      expect(result.rules).toEqual([
        expect.objectContaining({
          userAgent: '*',
          allow: '/',
          disallow: ['/auth/', '/dashboard/', '/pm/', '/api/'],
        }),
      ]);
      expect(result.rules).not.toEqual([{ userAgent: '*', disallow: '/' }]);
      expect(result.sitemap).toBe('https://www.sunsetcondos.org/sitemap.xml');
    });
  });
});
