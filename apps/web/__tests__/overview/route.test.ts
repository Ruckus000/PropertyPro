/**
 * Route unit test — `GET /api/v1/overview`.
 *
 * Added alongside Plan A1 drain #8 — the previous implementation had no
 * route-level unit test. This locks in:
 *   - the canonical `{ data: { cards, activity, events } }` envelope,
 *   - the per-service call arguments (userId, plus 30-day window for
 *     activity + events),
 *   - the unauthenticated 401 path,
 *   - the empty-result edge case.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  getCommunityCardsMock,
  getActivityFeedMock,
  getUpcomingEventsMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  getCommunityCardsMock: vi.fn(),
  getActivityFeedMock: vi.fn(),
  getUpcomingEventsMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/queries/cross-community', () => ({
  getCommunityCards: getCommunityCardsMock,
  getActivityFeed: getActivityFeedMock,
  getUpcomingEvents: getUpcomingEventsMock,
}));

import { GET } from '../../src/app/api/v1/overview/route';

interface EnvelopeJson {
  data: {
    cards: unknown[];
    activity: unknown[];
    events: unknown[];
  };
}

describe('GET /api/v1/overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-123');
  });

  it('returns the canonical { data: { cards, activity, events } } envelope', async () => {
    const cards = [{ communityId: 42, name: 'Sunset Condos' }];
    const activity = [{ id: 1, kind: 'announcement', communityId: 42 }];
    const events = [{ id: 7, title: 'Board meeting', communityId: 42 }];
    getCommunityCardsMock.mockResolvedValueOnce(cards);
    getActivityFeedMock.mockResolvedValueOnce(activity);
    getUpcomingEventsMock.mockResolvedValueOnce(events);

    const req = new NextRequest('http://localhost:3000/api/v1/overview');
    const res = await GET(req);
    const json = (await res.json()) as EnvelopeJson;

    expect(res.status).toBe(200);
    expect(json).toEqual({ data: { cards, activity, events } });
    expect(getCommunityCardsMock).toHaveBeenCalledWith('user-123');
    expect(getActivityFeedMock).toHaveBeenCalledWith('user-123', 30);
    expect(getUpcomingEventsMock).toHaveBeenCalledWith('user-123', 30);
  });

  it('returns empty arrays when the user has no cross-community data', async () => {
    getCommunityCardsMock.mockResolvedValueOnce([]);
    getActivityFeedMock.mockResolvedValueOnce([]);
    getUpcomingEventsMock.mockResolvedValueOnce([]);

    const req = new NextRequest('http://localhost:3000/api/v1/overview');
    const res = await GET(req);
    const json = (await res.json()) as EnvelopeJson;

    expect(res.status).toBe(200);
    expect(json).toEqual({ data: { cards: [], activity: [], events: [] } });
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest('http://localhost:3000/api/v1/overview');
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(getCommunityCardsMock).not.toHaveBeenCalled();
    expect(getActivityFeedMock).not.toHaveBeenCalled();
    expect(getUpcomingEventsMock).not.toHaveBeenCalled();
  });
});
