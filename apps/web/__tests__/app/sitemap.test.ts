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

import sitemap from '@/app/sitemap';

describe('sitemap.ts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists community public URLs on a subdomain host', async () => {
    headersMock.mockResolvedValueOnce(new Headers({ host: 'sunset-condos.getpropertypro.com' }));
    resolveCommunityContextMock.mockReturnValueOnce({
      source: 'host_subdomain',
      tenantSlug: 'sunset-condos',
      isReservedSubdomain: false,
      communityId: null,
    });
    const result = await sitemap();
    expect(result).toHaveLength(3);
    expect(result[0]?.url).toBe('https://sunset-condos.getpropertypro.com/');
    expect(result[1]?.url).toBe('https://sunset-condos.getpropertypro.com/transparency');
    expect(result[2]?.url).toBe('https://sunset-condos.getpropertypro.com/notices');
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
