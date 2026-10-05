/**
 * Route unit test — `GET /api/v1/me/communities`.
 *
 * Added alongside the Plan A1 drain (first non-pilot contracted route).
 * The previous implementation had no route-level unit test; this fills
 * the gap and locks in the envelope shape + projection.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  listCommunitiesForUserMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  listCommunitiesForUserMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/user-communities', () => ({
  listCommunitiesForUser: listCommunitiesForUserMock,
}));

import { GET } from '../../src/app/api/v1/me/communities/route';

interface EnvelopeJson {
  data: Array<{
    id: number;
    name: string;
    slug: string;
    role: string;
    displayTitle: string | null;
    communityType: 'condo_718' | 'hoa_720' | 'apartment';
  }>;
}

const FIXTURE_ROW = {
  communityId: 42,
  communityName: 'Sunset Condos',
  slug: 'sunset-condos',
  communityType: 'condo_718' as const,
  city: 'Miami',
  state: 'FL',
  logoPath: null,
  role: 'owner',
  isUnitOwner: true,
  displayTitle: 'Unit Owner',
};

describe('me/communities route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-123');
  });

  it('returns the canonical { data: T[] } envelope for a happy path', async () => {
    listCommunitiesForUserMock.mockResolvedValueOnce([FIXTURE_ROW]);

    const req = new NextRequest('http://localhost:3000/api/v1/me/communities');
    const res = await GET(req);
    const json = (await res.json()) as EnvelopeJson;

    expect(res.status).toBe(200);
    expect(json.data).toEqual([
      {
        id: 42,
        name: 'Sunset Condos',
        slug: 'sunset-condos',
        role: 'owner',
        displayTitle: 'Unit Owner',
        communityType: 'condo_718',
        logoUrl: null,
      },
    ]);
    expect(listCommunitiesForUserMock).toHaveBeenCalledWith('user-123');
  });

  it('projects each row to the wire shape only (drops city/state/logo/isUnitOwner)', async () => {
    listCommunitiesForUserMock.mockResolvedValueOnce([
      FIXTURE_ROW,
      {
        ...FIXTURE_ROW,
        communityId: 99,
        communityName: 'Palm Shores HOA',
        slug: 'palm-shores',
        communityType: 'hoa_720' as const,
      },
    ]);

    const req = new NextRequest('http://localhost:3000/api/v1/me/communities');
    const res = await GET(req);
    const json = (await res.json()) as EnvelopeJson;

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(2);
    for (const item of json.data) {
      // No row should leak any field outside the contract.
      expect(Object.keys(item).sort()).toEqual(
        ['communityType', 'displayTitle', 'id', 'logoUrl', 'name', 'role', 'slug'],
      );
    }
  });

  describe('logoUrl, for the switcher avatar', () => {
    const BASE = 'https://proj.supabase.co/storage/v1/object/public/community-assets';
    const get = async (row: Record<string, unknown>) => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
      listCommunitiesForUserMock.mockResolvedValueOnce([{ ...FIXTURE_ROW, ...row }]);
      const res = await GET(new NextRequest('http://localhost:3000/api/v1/me/communities'));
      vi.unstubAllEnvs();
      return ((await res.json()) as { data: Array<{ logoUrl: string | null }> }).data[0]!.logoUrl;
    };

    it("is the public email PNG of the community's square logo", async () => {
      expect(
        await get({ brandingEmailLogoPath: '42/email/logo-a.png', brandingLogoPath: 'communities/42/branding/logo.webp' }),
      ).toBe(`${BASE}/42/email/logo-a.png`);
    });

    it('falls back to an admin-uploaded logo, which is public too', async () => {
      expect(await get({ brandingEmailLogoPath: null, brandingLogoPath: '42/site/abc.png' })).toBe(
        `${BASE}/42/site/abc.png`,
      );
    });

    it.each([
      ['a logo only in the private bucket (never signed here)', { brandingLogoPath: 'communities/42/branding/logo.webp' }],
      ["another community's file", { brandingEmailLogoPath: '43/email/logo-a.png' }],
      ['traversal out of the prefix', { brandingEmailLogoPath: '42/email/../../43/email/x.png' }],
      ['no logo at all', {}],
    ])('is null for %s', async (_label, row) => {
      expect(await get({ brandingEmailLogoPath: null, brandingLogoPath: null, ...row })).toBeNull();
    });
  });

  it('returns the canonical envelope with an empty array for a brand-new user', async () => {
    listCommunitiesForUserMock.mockResolvedValueOnce([]);

    const req = new NextRequest('http://localhost:3000/api/v1/me/communities');
    const res = await GET(req);
    const json = (await res.json()) as EnvelopeJson;

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest('http://localhost:3000/api/v1/me/communities');
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(listCommunitiesForUserMock).not.toHaveBeenCalled();
  });

  describe('under a support session', () => {
    const TWO_COMMUNITIES = [
      FIXTURE_ROW,
      { ...FIXTURE_ROW, communityId: 99, communityName: 'Palm Shores HOA', slug: 'palm-shores' },
    ];

    function supportReq(communityId: string | null): NextRequest {
      const headers: Record<string, string> = { 'x-support-session-id': '7' };
      if (communityId !== null) headers['x-support-community-id'] = communityId;
      return new NextRequest('http://localhost:3000/api/v1/me/communities', { headers });
    }

    it('lists only the consented community', async () => {
      listCommunitiesForUserMock.mockResolvedValueOnce(TWO_COMMUNITIES);

      const res = await GET(supportReq('99'));
      const json = (await res.json()) as EnvelopeJson;

      expect(res.status).toBe(200);
      expect(json.data.map((c) => c.id)).toEqual([99]);
    });

    it('lists nothing when the session community is unreadable (fail closed)', async () => {
      listCommunitiesForUserMock.mockResolvedValueOnce(TWO_COMMUNITIES);

      const res = await GET(supportReq(null));
      const json = (await res.json()) as EnvelopeJson;

      expect(res.status).toBe(200);
      expect(json.data).toEqual([]);
    });
  });
});
