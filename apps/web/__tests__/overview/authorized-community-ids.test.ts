/**
 * `getAuthorizedCommunityIds` — the funnel every cross-community overview
 * helper (and the /dashboard + /dashboard/overview pages) goes through — narrows
 * to the support session's consented community.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUserCommunitiesUnscopedMock, createScopedClientMock } = vi.hoisted(() => ({
  findUserCommunitiesUnscopedMock: vi.fn(),
  createScopedClientMock: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  findUserCommunitiesUnscoped: findUserCommunitiesUnscopedMock,
}));
vi.mock('@propertypro/db', () => ({
  buildAccessibleDocumentsFilter: vi.fn(),
  createScopedClient: createScopedClientMock,
  communities: { id: 'id', name: 'name', slug: 'slug', communityType: 'communityType' },
  complianceChecklistItems: {},
  documents: {},
  meetings: {},
}));
vi.mock('@propertypro/db/filters', () => ({
  and: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
}));
vi.mock('@/lib/db/access-control', () => ({ checkPermissionV2: vi.fn(() => true) }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: vi.fn() }));
vi.mock('@/lib/announcements/read-visibility', () => ({ listVisibleAnnouncements: vi.fn() }));

import { getAuthorizedCommunityIds, getCommunityCards } from '@/lib/queries/cross-community';

const ROWS = [
  { communityId: 1 },
  { communityId: 2 },
  { communityId: 2 }, // a second role in the same community
  { communityId: 3 },
];

describe('getAuthorizedCommunityIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUserCommunitiesUnscopedMock.mockResolvedValue(ROWS);
  });

  it('returns every distinct membership outside a support session', async () => {
    await expect(getAuthorizedCommunityIds('u-1', null)).resolves.toEqual([1, 2, 3]);
    expect(findUserCommunitiesUnscopedMock).toHaveBeenCalledWith('u-1');
  });

  it('returns only the consented community under a support session', async () => {
    await expect(getAuthorizedCommunityIds('u-1', { communityId: 2 })).resolves.toEqual([2]);
  });

  it('returns nothing when the consented community is not one of the user\'s', async () => {
    await expect(getAuthorizedCommunityIds('u-1', { communityId: 9 })).resolves.toEqual([]);
  });

  it('returns nothing when the session community is unreadable (fail closed)', async () => {
    await expect(getAuthorizedCommunityIds('u-1', { communityId: null })).resolves.toEqual([]);
  });

  it('getCommunityCards queries only the consented community', async () => {
    // A scoped client whose meta read finds nothing, so each card short-circuits.
    createScopedClientMock.mockImplementation(() => ({
      selectFrom: () => ({ limit: async () => [] }),
    }));

    await getCommunityCards('u-1', { communityId: 3 });
    expect(createScopedClientMock.mock.calls.map((c) => c[0])).toEqual([3]);

    createScopedClientMock.mockClear();
    await getCommunityCards('u-1', null);
    expect(createScopedClientMock.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
  });
});
