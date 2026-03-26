import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPresetPermissions } from '@propertypro/shared';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  redirectMock,
  createScopedClientMock,
  meetingsPageShellMock,
  compactCardMock,
  meetingsTableMock,
  communitiesTableMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  redirectMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  meetingsPageShellMock: vi.fn(() => null),
  compactCardMock: vi.fn(() => null),
  meetingsTableMock: {
    id: Symbol('meetings.id'),
    startsAt: Symbol('meetings.startsAt'),
  },
  communitiesTableMock: {
    id: Symbol('communities.id'),
    slug: Symbol('communities.slug'),
  },
}));

function makeSelectResult<T>(rows: T[]) {
  const chainable = {
    orderBy: vi.fn().mockReturnValue({
      ...Promise.resolve(rows),
      then: (r: (v: T[]) => unknown) => Promise.resolve(rows).then(r),
      limit: vi.fn().mockResolvedValue(rows),
    }),
    then: (r: (v: T[]) => unknown) => Promise.resolve(rows).then(r),
  };
  return Object.assign(Promise.resolve(rows), chainable);
}

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  meetings: meetingsTableMock,
  communities: communitiesTableMock,
}));

vi.mock('@/components/meetings/meetings-page-shell', () => ({
  MeetingsPageShell: meetingsPageShellMock,
}));

vi.mock('@/components/mobile/MobileMeetingsContent', () => ({
  MobileMeetingsContent: compactCardMock,
}));

vi.mock('@propertypro/shared', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getFeaturesForCommunity: () => ({ hasCompliance: true, hasMeetings: true }),
  };
});

vi.mock('@propertypro/db/filters', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual };
});

vi.mock('@/lib/utils/timezone', () => ({
  resolveTimezone: (tz: string) => tz || 'America/New_York',
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: vi.fn(),
  checkPermissionV2: vi.fn(() => true),
}));

import MeetingsPage from '../../src/app/(authenticated)/communities/[id]/meetings/page';
import MobileMeetingsPage from '../../src/app/mobile/meetings/page';

describe('meetings pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
  });

  it('desktop page passes apartment manager props into the meetings page shell', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'user-1',
      communityId: 7,
      role: 'manager',
      isAdmin: true,
      isUnitOwner: false,
      displayTitle: 'Site Manager',
      presetKey: 'site_manager',
      permissions: getPresetPermissions('site_manager', 'apartment'),
      communityType: 'apartment',
      timezone: 'America/New_York',
    });

    createScopedClientMock.mockReturnValue({
      selectFrom: vi.fn(() => makeSelectResult([{ slug: 'metro-apartments' }])),
    });

    const result = await MeetingsPage({ params: Promise.resolve({ id: '7' }) });

    expect(result).toMatchObject({
      props: expect.objectContaining({
        communityId: 7,
        userId: 'user-1',
        role: 'manager',
        canWrite: true,
        communitySlug: 'metro-apartments',
      }),
    });
  });

  it('mobile page allows apartment tenants to read meetings without redirecting away', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'user-1',
      communityId: 7,
      role: 'resident',
      isAdmin: false,
      isUnitOwner: false,
      displayTitle: 'Tenant',
      communityType: 'apartment',
      timezone: 'America/New_York',
      city: 'Tampa',
      state: 'FL',
    });

    createScopedClientMock.mockReturnValue({
      selectFrom: vi.fn(() => makeSelectResult([])),
    });

    await MobileMeetingsPage({
      searchParams: Promise.resolve({ communityId: '7' }),
    });

    expect(redirectMock).not.toHaveBeenCalledWith('/mobile?communityId=7');
    expect(compactCardMock).not.toHaveBeenCalled();
  });
});
