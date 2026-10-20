/**
 * Per-group gates of the aggregated command-palette search
 * (`searchAccessibleGroups`, behind GET /api/v1/search).
 *
 * `search-route.test.ts` mocks `searchAccessibleGroups` whole, so the gates
 * live here: a group runs only when the caller can READ its resource and the
 * community's type + plan enable its feature. These pins replaced the ones the
 * deleted per-group routes (`/api/v1/search/{documents,announcements,meetings,
 * maintenance,violations}`) carried — the palette never called those.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunityMembership } from '@/lib/api/community-membership';
import type { ResourceAccessMap } from '@/lib/db/access-control';

const {
  getMembershipResourceAccessMock,
  searchDocumentsByTrigramMock,
  searchVisibleAnnouncementsMock,
  searchMeetingsByTrigramMock,
  searchMaintenanceByTrigramMock,
  searchViolationsByTrigramMock,
  searchResidentsByTrigramMock,
} = vi.hoisted(() => ({
  getMembershipResourceAccessMock: vi.fn(),
  searchDocumentsByTrigramMock: vi.fn(),
  searchVisibleAnnouncementsMock: vi.fn(),
  searchMeetingsByTrigramMock: vi.fn(),
  searchMaintenanceByTrigramMock: vi.fn(),
  searchViolationsByTrigramMock: vi.fn(),
  searchResidentsByTrigramMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  searchDocumentsByTrigram: searchDocumentsByTrigramMock,
  searchMeetingsByTrigram: searchMeetingsByTrigramMock,
  searchMaintenanceByTrigram: searchMaintenanceByTrigramMock,
  searchViolationsByTrigram: searchViolationsByTrigramMock,
  searchResidentsByTrigram: searchResidentsByTrigramMock,
}));

vi.mock('@/lib/announcements/read-visibility', () => ({
  searchVisibleAnnouncements: searchVisibleAnnouncementsMock,
  formatAnnouncementAudienceLabel: () => 'Everyone',
}));

vi.mock('@/lib/db/access-control', () => ({
  getMembershipResourceAccess: getMembershipResourceAccessMock,
}));

import { searchAccessibleGroups } from '@/lib/search/data-search-service';

const GROUP_QUERIES = {
  documents: searchDocumentsByTrigramMock,
  announcements: searchVisibleAnnouncementsMock,
  meetings: searchMeetingsByTrigramMock,
  maintenance: searchMaintenanceByTrigramMock,
  violations: searchViolationsByTrigramMock,
} as const;

type GatedGroup = keyof typeof GROUP_QUERIES;
const GATED_GROUPS = Object.keys(GROUP_QUERIES) as GatedGroup[];

function membership(overrides: Partial<CommunityMembership> = {}): CommunityMembership {
  return {
    userId: 'user-1',
    communityId: 42,
    communityName: 'Sunset Condos',
    role: 'resident',
    communityType: 'condo_718',
    subscriptionPlan: 'professional',
    subscriptionStatus: 'active',
    freeAccessExpiresAt: null,
    isUnitOwner: true,
    isAdmin: false,
    displayTitle: 'Owner',
    city: null,
    state: null,
    timezone: 'America/New_York',
    isDemo: false,
    trialEndsAt: null,
    demoExpiresAt: null,
    electionsAttorneyReviewed: false,
    ...overrides,
  } as CommunityMembership;
}

function accessWithout(denied: string | null): ResourceAccessMap {
  return new Proxy({} as ResourceAccessMap, {
    get: (_target, resource) => ({ read: resource !== denied, write: false }),
  });
}

async function searchedKeys(m: CommunityMembership): Promise<string[]> {
  const groups = await searchAccessibleGroups(42, m, 'board', 3);
  return groups.map((group) => group.key);
}

describe('searchAccessibleGroups — per-group gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMembershipResourceAccessMock.mockReturnValue(accessWithout(null));
    searchDocumentsByTrigramMock.mockResolvedValue({ results: [], totalCount: 0 });
    searchVisibleAnnouncementsMock.mockResolvedValue({ rows: [], totalCount: 0 });
    searchMeetingsByTrigramMock.mockResolvedValue({ results: [], totalCount: 0 });
    searchMaintenanceByTrigramMock.mockResolvedValue({ results: [], totalCount: 0 });
    searchViolationsByTrigramMock.mockResolvedValue({ results: [], totalCount: 0 });
    searchResidentsByTrigramMock.mockResolvedValue({ results: [], totalCount: 0 });
  });

  it('control: a reader on a professional condo searches all five non-admin groups', async () => {
    expect(await searchedKeys(membership())).toEqual(GATED_GROUPS);
    for (const query of Object.values(GROUP_QUERIES)) {
      expect(query).toHaveBeenCalledTimes(1);
    }
  });

  it.each(GATED_GROUPS)('skips %s, and never queries it, without read permission', async (group) => {
    getMembershipResourceAccessMock.mockReturnValue(accessWithout(group));

    const keys = await searchedKeys(membership());

    expect(keys).not.toContain(group);
    expect(keys).toHaveLength(GATED_GROUPS.length - 1);
    expect(GROUP_QUERIES[group]).not.toHaveBeenCalled();
  });

  it('skips violations when the plan does not include it (essentials)', async () => {
    const keys = await searchedKeys(membership({ subscriptionPlan: 'essentials' }));

    expect(keys).not.toContain('violations');
    expect(keys).toContain('documents');
    expect(searchViolationsByTrigramMock).not.toHaveBeenCalled();
  });

  it('skips violations when the community type does not include it (apartment)', async () => {
    const keys = await searchedKeys(
      membership({ communityType: 'apartment', subscriptionPlan: 'operations_plus' }),
    );

    expect(keys).not.toContain('violations');
    expect(keys).toContain('documents');
    expect(searchViolationsByTrigramMock).not.toHaveBeenCalled();
  });
});
