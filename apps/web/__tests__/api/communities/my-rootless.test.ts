import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { requireAuthenticatedUserIdMock, findMyRootlessCommunitiesMock } = vi.hoisted(
  () => ({
    requireAuthenticatedUserIdMock: vi.fn(),
    findMyRootlessCommunitiesMock: vi.fn(),
  }),
);

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  findMyRootlessCommunities: findMyRootlessCommunitiesMock,
}));

import { GET } from '../../../src/app/api/v1/communities/my-rootless/route';

function getReq(): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/communities/my-rootless', {
    method: 'GET',
  });
}

describe('GET /api/v1/communities/my-rootless', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('pm-1');
  });

  it('returns the caller’s rootless communities wrapped in the canonical envelope', async () => {
    findMyRootlessCommunitiesMock.mockResolvedValue([
      { id: 1, name: 'Sunset Condos', slug: 'sunset-condos' },
      { id: 2, name: 'Palm Shores HOA', slug: 'palm-shores-hoa' },
    ]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      data: {
        communities: [
          { id: 1, name: 'Sunset Condos', slug: 'sunset-condos' },
          { id: 2, name: 'Palm Shores HOA', slug: 'palm-shores-hoa' },
        ],
      },
    });
    expect(findMyRootlessCommunitiesMock).toHaveBeenCalledWith('pm-1');
  });

  it('returns an empty list when the caller has no rootless communities', async () => {
    findMyRootlessCommunitiesMock.mockResolvedValue([]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { communities: [] } });
  });

  it('passes the authenticated user id (never an attacker-supplied value)', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValue('pm-99');
    findMyRootlessCommunitiesMock.mockResolvedValue([]);

    await GET(getReq());
    expect(findMyRootlessCommunitiesMock).toHaveBeenCalledWith('pm-99');
  });
});
