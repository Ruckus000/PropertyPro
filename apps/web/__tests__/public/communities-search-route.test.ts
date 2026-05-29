import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const searchPublicCommunitiesMock = vi.fn();
const rateLimiterCheckMock = vi.fn();

vi.mock('@/lib/services/community-search-service', () => ({
  searchPublicCommunities: (...args: unknown[]) => searchPublicCommunitiesMock(...args),
}));

vi.mock('@/lib/middleware/rate-limiter', () => ({
  getRateLimiter: () => ({
    check: (...args: unknown[]) => rateLimiterCheckMock(...args),
  }),
}));

import { GET } from '@/app/api/v1/public/communities/search/route';

function getRequest(query: string): NextRequest {
  return new NextRequest(
    `https://app.test/api/v1/public/communities/search?${query}`,
  );
}

describe('GET /api/v1/public/communities/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimiterCheckMock.mockReturnValue({ allowed: true, retryAfter: 0 });
    searchPublicCommunitiesMock.mockResolvedValue([
      {
        id: 1,
        name: 'Sunset Condos',
        city: 'Miami',
        state: 'FL',
        communityType: 'condo_718',
        memberCount: 120,
      },
    ]);
  });

  it('returns search results in canonical envelope', async () => {
    const res = await GET(getRequest('q=sunset'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(searchPublicCommunitiesMock).toHaveBeenCalledWith({
      q: 'sunset',
      city: undefined,
    });
  });

  it('forwards optional city filter', async () => {
    await GET(getRequest('q=sunset&city=Miami'));
    expect(searchPublicCommunitiesMock).toHaveBeenCalledWith({
      q: 'sunset',
      city: 'Miami',
    });
  });

  it('returns 400 when q is too short', async () => {
    const res = await GET(getRequest('q=a'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(searchPublicCommunitiesMock).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    rateLimiterCheckMock.mockReturnValueOnce({ allowed: false, retryAfter: 30 });
    const res = await GET(getRequest('q=sunset'));
    expect(res.status).toBe(429);
    expect(searchPublicCommunitiesMock).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited even for invalid query', async () => {
    rateLimiterCheckMock.mockReturnValueOnce({ allowed: false, retryAfter: 30 });
    const res = await GET(getRequest('q=a'));
    expect(res.status).toBe(429);
    expect(searchPublicCommunitiesMock).not.toHaveBeenCalled();
  });
});
