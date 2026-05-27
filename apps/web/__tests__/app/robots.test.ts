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
    expect(result.rules).toEqual([
      expect.objectContaining({
        userAgent: '*',
        allow: ['/', '/transparency', '/notices', '/request-access'],
        disallow: ['/auth/', '/dashboard/', '/pm/', '/api/'],
      }),
    ]);
    expect(result.sitemap).toBe('https://sunset-condos.getpropertypro.com/sitemap.xml');
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

  it('returns marketing-root policy on a reserved subdomain (e.g., pm.)', async () => {
    headersMock.mockResolvedValueOnce(new Headers({ host: 'pm.getpropertypro.com' }));
    resolveCommunityContextMock.mockReturnValueOnce({
      source: 'host_subdomain',
      tenantSlug: 'pm',
      isReservedSubdomain: true,
      communityId: null,
    });
    const result = await robots();
    expect(result.rules?.[0]?.allow).toBe('/'); // Marketing-style, not community
  });
});
