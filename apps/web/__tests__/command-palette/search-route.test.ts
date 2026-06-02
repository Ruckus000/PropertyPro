import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  searchAccessibleGroupsMock,
  randomUUIDMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  searchAccessibleGroupsMock: vi.fn(),
  randomUUIDMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@/lib/search/data-search-service', () => ({
  searchAccessibleGroups: searchAccessibleGroupsMock,
}));

import { GET } from '../../src/app/api/v1/search/route';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'manager',
  communityType: 'condo_718',
  isUnitOwner: false,
  isAdmin: true,
  displayTitle: 'Board Member',
  city: null,
  state: null,
  timezone: 'America/New_York',
  isDemo: false,
  trialEndsAt: null,
  demoExpiresAt: null,
  electionsAttorneyReviewed: false,
};

function makeRequest(qs: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/search${qs}`);
}

describe('GET /api/v1/search (aggregated search) — runRoute drain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    randomUUIDMock.mockReturnValue('req-123');
    vi.stubGlobal('crypto', { randomUUID: randomUUIDMock });
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    searchAccessibleGroupsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns aggregated metadata wrapped in the canonical { data } envelope', async () => {
    searchAccessibleGroupsMock.mockResolvedValue([
      {
        key: 'documents',
        label: 'Documents',
        status: 'ok',
        totalCount: 1,
        results: [],
        durationMs: 4,
      },
      {
        key: 'announcements',
        label: 'Announcements',
        status: 'error',
        totalCount: 0,
        results: [],
        error: 'Search is temporarily unavailable for this section.',
        durationMs: 5,
      },
    ]);

    const response = await GET(makeRequest('?communityId=42&q=board&limit=5'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(searchAccessibleGroupsMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ userId: 'user-1' }),
      'board',
      5,
    );
    expect(json).toEqual({
      data: {
        requestId: 'req-123',
        communityId: 42,
        partial: true,
        groups: [
          expect.objectContaining({ key: 'documents', status: 'ok' }),
          expect.objectContaining({ key: 'announcements', status: 'error' }),
        ],
      },
    });
  });

  it('partial is false when no group reports an error', async () => {
    searchAccessibleGroupsMock.mockResolvedValue([
      { key: 'documents', label: 'Documents', status: 'ok', totalCount: 0, results: [], durationMs: 1 },
    ]);

    const response = await GET(makeRequest('?communityId=42&q=board&limit=3'));
    const json = await response.json();

    expect(json.data.partial).toBe(false);
  });

  it('defaults limit to 3 and trims q when both omitted/whitespace', async () => {
    const response = await GET(makeRequest('?communityId=42&q=%20%20'));
    expect(response.status).toBe(200);

    expect(searchAccessibleGroupsMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ userId: 'user-1' }),
      '',
      3,
    );
  });

  it('falls back to the header tenant when communityId is absent (?? null)', async () => {
    resolveEffectiveCommunityIdMock.mockReturnValue(99);

    const response = await GET(makeRequest('?q=board'));
    expect(response.status).toBe(200);

    // resolveEffectiveCommunityId called with null (header fallback) when no communityId query param.
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.anything(), null);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(99, 'user-1');
  });

  it('clamps an over-the-max limit value via schema 400 (limit > 20)', async () => {
    const response = await GET(makeRequest('?communityId=42&q=board&limit=50'));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(searchAccessibleGroupsMock).not.toHaveBeenCalled();
  });

  it('400s a non-numeric communityId (VALIDATION_ERROR)', async () => {
    const response = await GET(makeRequest('?communityId=abc&q=board'));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(searchAccessibleGroupsMock).not.toHaveBeenCalled();
  });

  it('400s a zero communityId (VALIDATION_ERROR) — distinct from non-numeric', async () => {
    const response = await GET(makeRequest('?communityId=0&q=board'));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(searchAccessibleGroupsMock).not.toHaveBeenCalled();
  });

  it('propagates a 401 from requireAuthenticatedUserId before any downstream call', async () => {
    const { UnauthorizedError } = await import('@/lib/api/errors');
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError('Not authenticated'));

    const response = await GET(makeRequest('?communityId=42&q=board'));

    expect(response.status).toBe(401);
    expect(resolveEffectiveCommunityIdMock).not.toHaveBeenCalled();
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(searchAccessibleGroupsMock).not.toHaveBeenCalled();
  });

  it('propagates a 403 from requireCommunityMembership before searchAccessibleGroups', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requireCommunityMembershipMock.mockRejectedValue(new ForbiddenError('Not a member'));

    const response = await GET(makeRequest('?communityId=42&q=board'));

    expect(response.status).toBe(403);
    expect(searchAccessibleGroupsMock).not.toHaveBeenCalled();
  });
});
