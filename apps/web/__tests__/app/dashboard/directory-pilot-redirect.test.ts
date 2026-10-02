/**
 * Directory pilot: for a flagged community the old Units and Residents pages
 * send managers to the Directory (307, so flag-off is the rollback); for every
 * other community they render exactly as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { redirectMock, membershipMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  membershipMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'localhost:3000' }) }));
// The real module also opens a DB client at import; only this pure helper is used.
vi.mock('@/lib/tenant/community-resolution', () => ({
  toUrlSearchParams: (sp: Record<string, string | undefined>) =>
    new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => e[1] != null)),
}));
vi.mock('@/lib/request/page-auth-context', () => ({ requirePageAuthenticatedUserId: async () => 'pm-1' }));
vi.mock('@/lib/request/page-community-context', () => ({ requirePageCommunityMembership: membershipMock }));
vi.mock('@/lib/db/access-control', () => ({ requirePermission: vi.fn(), checkPermissionV2: () => true }));
vi.mock('@/components/units/units-page-client', () => ({ UnitsPageClient: () => null }));
vi.mock('@/components/residents/residents-page-client', () => ({ ResidentsPageClient: () => null }));

import UnitsPage from '../../../src/app/(authenticated)/dashboard/units/page';
import ResidentsPage from '../../../src/app/(authenticated)/dashboard/residents/page';

const params = (communityId: string) => ({ searchParams: Promise.resolve({ communityId }) });

describe('old pages during the Directory pilot', () => {
  const original = process.env.DIRECTORY_V2_COMMUNITIES;
  beforeEach(() => {
    vi.clearAllMocks();
    membershipMock.mockResolvedValue({ isAdmin: true, communityType: 'condo_718', isUnitOwner: false });
  });
  afterEach(() => {
    process.env.DIRECTORY_V2_COMMUNITIES = original;
  });

  it.each([
    ['units', UnitsPage],
    ['residents', ResidentsPage],
  ] as const)('/dashboard/%s goes to the matching Directory tab for a flagged community', async (tab, Page) => {
    process.env.DIRECTORY_V2_COMMUNITIES = '7, 42';
    await expect(Page(params('42'))).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith(`/dashboard/directory?communityId=42&tab=${tab}`);
    expect(membershipMock).not.toHaveBeenCalled(); // the Directory does its own checks
  });

  it.each([
    ['units', UnitsPage],
    ['residents', ResidentsPage],
  ] as const)('/dashboard/%s renders as before for a community outside the pilot', async (_tab, Page) => {
    process.env.DIRECTORY_V2_COMMUNITIES = '7';
    await expect(Page(params('42'))).resolves.toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
