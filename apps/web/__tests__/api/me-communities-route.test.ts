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
        ['communityType', 'displayTitle', 'id', 'name', 'role', 'slug'],
      );
    }
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
});
