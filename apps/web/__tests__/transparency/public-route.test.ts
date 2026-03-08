import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  findCommunityBySlugUnscopedMock,
  getFeaturesForCommunityMock,
  getTransparencyPageDataMock,
} = vi.hoisted(() => ({
  findCommunityBySlugUnscopedMock: vi.fn(),
  getFeaturesForCommunityMock: vi.fn(),
  getTransparencyPageDataMock: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  findCommunityBySlugUnscoped: findCommunityBySlugUnscopedMock,
}));

vi.mock('@propertypro/shared', async () => {
  const actual = await vi.importActual<typeof import('@propertypro/shared')>('@propertypro/shared');
  return {
    ...actual,
    getFeaturesForCommunity: getFeaturesForCommunityMock,
  };
});

vi.mock('@/lib/services/transparency-service', () => ({
  getTransparencyPageData: getTransparencyPageDataMock,
}));

import { GET } from '../../src/app/api/v1/transparency/route';

function makeRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

describe('transparency public route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getFeaturesForCommunityMock.mockReturnValue({ hasTransparencyPage: true });
    findCommunityBySlugUnscopedMock.mockResolvedValue({
      id: 42,
      slug: 'sunset-condos',
      name: 'Sunset Condos',
      communityType: 'condo_718',
      transparencyEnabled: true,
      timezone: 'America/New_York',
      addressLine1: null,
      addressLine2: null,
      city: 'Miami',
      state: 'FL',
      zipCode: '33101',
    });
    getTransparencyPageDataMock.mockResolvedValue({
      community: {
        id: 42,
        slug: 'sunset-condos',
        name: 'Sunset Condos',
        communityType: 'condo_718',
        city: 'Miami',
        state: 'FL',
        logoPath: null,
        timezone: 'America/New_York',
      },
      documents: [],
      meetingNotices: {
        meetings: [],
        ownerNoticeDays: 14,
        boardNoticeHours: 48,
      },
      minutesAvailability: {
        months: [],
        totalMonths: 0,
        monthsWithMinutes: 0,
      },
      portalStatus: {
        passwordProtected: true,
        individualCredentials: true,
        publicNoticesPage: true,
      },
      metadata: {
        generatedAt: '2026-03-07T12:00:00.000Z',
        dataSource: 'PropertyPro Platform',
      },
    });
  });

  it('returns 200 with cache headers for an opt-in community', async () => {
    const res = await GET(makeRequest('http://localhost:3000/api/v1/transparency?slug=sunset-condos'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=3600');

    const json = (await res.json()) as { data: { community: { slug: string } } };
    expect(json.data.community.slug).toBe('sunset-condos');
    expect(getTransparencyPageDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 42,
        slug: 'sunset-condos',
      }),
    );
  });

  it('returns 400 when slug query parameter is missing', async () => {
    const res = await GET(makeRequest('http://localhost:3000/api/v1/transparency'));
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown or deleted slug', async () => {
    findCommunityBySlugUnscopedMock.mockResolvedValueOnce(null);

    const res = await GET(makeRequest('http://localhost:3000/api/v1/transparency?slug=missing-community'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when community type does not support transparency', async () => {
    getFeaturesForCommunityMock.mockReturnValueOnce({ hasTransparencyPage: false });

    const res = await GET(makeRequest('http://localhost:3000/api/v1/transparency?slug=sunset-condos'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when transparency is not enabled', async () => {
    findCommunityBySlugUnscopedMock.mockResolvedValueOnce({
      id: 42,
      slug: 'sunset-condos',
      name: 'Sunset Condos',
      communityType: 'condo_718',
      transparencyEnabled: false,
      timezone: 'America/New_York',
      addressLine1: null,
      addressLine2: null,
      city: 'Miami',
      state: 'FL',
      zipCode: '33101',
    });

    const res = await GET(makeRequest('http://localhost:3000/api/v1/transparency?slug=sunset-condos'));
    expect(res.status).toBe(404);
  });

  it('does not leak file URLs or uploader fields in public response body', async () => {
    const res = await GET(makeRequest('http://localhost:3000/api/v1/transparency?slug=sunset-condos'));
    const json = (await res.json()) as Record<string, unknown>;
    const serialized = JSON.stringify(json);

    expect(serialized).not.toContain('filePath');
    expect(serialized).not.toContain('uploadedBy');
  });
});
