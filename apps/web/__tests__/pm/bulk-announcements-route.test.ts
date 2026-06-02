import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  isPmAdminInAnyCommunityMock,
  findManagedCommunitiesPortfolioUnscopedMock,
  assertNotDemoGraceMock,
  broadcastBulkAnnouncementToCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  isPmAdminInAnyCommunityMock: vi.fn(),
  findManagedCommunitiesPortfolioUnscopedMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  broadcastBulkAnnouncementToCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  isPmAdminInAnyCommunity: isPmAdminInAnyCommunityMock,
  findManagedCommunitiesPortfolioUnscoped: findManagedCommunitiesPortfolioUnscopedMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/pm/bulk-announcement-broadcast', () => ({
  broadcastBulkAnnouncementToCommunity: broadcastBulkAnnouncementToCommunityMock,
}));

import { POST } from '../../src/app/api/v1/pm/bulk/announcements/route';

const URL = 'http://localhost:3000/api/v1/pm/bulk/announcements';

const validBody = {
  communityIds: [10, 11],
  title: 'Pool closure',
  body: '<p>Closed for maintenance</p>',
  audience: 'all',
  isPinned: false,
};

describe('POST /api/v1/pm/bulk/announcements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('pm-user-1');
    isPmAdminInAnyCommunityMock.mockResolvedValue(true);
    findManagedCommunitiesPortfolioUnscopedMock.mockResolvedValue([
      { communityId: 10, communityName: 'Alpha Condos' },
      { communityId: 11, communityName: 'Beta HOA' },
    ]);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    broadcastBulkAnnouncementToCommunityMock.mockResolvedValue(undefined);
  });

  it('broadcasts to managed communities and returns results', async () => {
    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.results).toEqual([
      { communityId: 10, communityName: 'Alpha Condos', status: 'sent' },
      { communityId: 11, communityName: 'Beta HOA', status: 'sent' },
    ]);
    expect(broadcastBulkAnnouncementToCommunityMock).toHaveBeenCalledTimes(2);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(10);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(11);
  });

  it('returns 401 without calling PM gate when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
    );

    expect(response.status).toBe(401);
    expect(isPmAdminInAnyCommunityMock).not.toHaveBeenCalled();
    expect(findManagedCommunitiesPortfolioUnscopedMock).not.toHaveBeenCalled();
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(broadcastBulkAnnouncementToCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a PM admin', async () => {
    isPmAdminInAnyCommunityMock.mockResolvedValueOnce(false);

    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
    );

    expect(response.status).toBe(403);
    expect(isPmAdminInAnyCommunityMock).toHaveBeenCalledWith('pm-user-1');
    expect(findManagedCommunitiesPortfolioUnscopedMock).not.toHaveBeenCalled();
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(broadcastBulkAnnouncementToCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when communityIds include unmanaged communities', async () => {
    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...validBody, communityIds: [10, 99] }),
      }),
    );

    expect(response.status).toBe(403);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(broadcastBulkAnnouncementToCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid body without side effects', async () => {
    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Missing communities' }),
      }),
    );

    expect(response.status).toBe(400);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(broadcastBulkAnnouncementToCommunityMock).not.toHaveBeenCalled();
  });

  it('maps per-community failures into failed results', async () => {
    broadcastBulkAnnouncementToCommunityMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('SMTP down'));

    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.results).toEqual([
      { communityId: 10, communityName: 'Alpha Condos', status: 'sent' },
      {
        communityId: 11,
        communityName: 'Beta HOA',
        status: 'failed',
        error: 'SMTP down',
      },
    ]);
  });
});
