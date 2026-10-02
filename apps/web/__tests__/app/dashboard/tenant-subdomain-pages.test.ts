/**
 * Real pages on a tenant subdomain (sunset-condos.<root>): they must resolve
 * the community from middleware's forwarded id, not fall back to "Add a valid
 * communityId". Units (flagged → Directory) and Announcements as samples.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { redirectMock, membershipMock, headerState } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  membershipMock: vi.fn(),
  headerState: { value: new Headers() },
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock, notFound: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => headerState.value }));
vi.mock('@/lib/tenant/community-resolution', () => ({
  toUrlSearchParams: (sp: Record<string, string | undefined>) =>
    new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => e[1] != null)),
}));
vi.mock('@/lib/request/page-auth-context', () => ({ requirePageAuthenticatedUserId: async () => 'pm-1' }));
vi.mock('@/lib/request/page-community-context', () => ({ requirePageCommunityMembership: membershipMock }));
vi.mock('@/lib/db/access-control', () => ({ requirePermission: vi.fn(), checkPermissionV2: () => true }));
vi.mock('@/components/units/units-page-client', () => ({ UnitsPageClient: () => null }));

import UnitsPage from '../../../src/app/(authenticated)/dashboard/units/page';

describe('pages on a tenant subdomain', () => {
  const original = process.env.DIRECTORY_V2_COMMUNITIES;
  beforeEach(() => {
    vi.clearAllMocks();
    membershipMock.mockResolvedValue({ isAdmin: true, communityType: 'condo_718', isUnitOwner: false });
    headerState.value = new Headers({ host: 'sunset-condos.getpropertypro.com', 'x-community-id': '1' });
  });
  afterEach(() => {
    process.env.DIRECTORY_V2_COMMUNITIES = original;
  });

  it('/dashboard/units resolves the community from the subdomain (→ Directory when flagged)', async () => {
    process.env.DIRECTORY_V2_COMMUNITIES = 'all';
    await expect(UnitsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/dashboard/directory?communityId=1&tab=units');
  });

  it('/dashboard/units renders for that community when not flagged — not "Add a valid communityId"', async () => {
    process.env.DIRECTORY_V2_COMMUNITIES = '';
    await UnitsPage({ searchParams: Promise.resolve({}) });
    expect(membershipMock).toHaveBeenCalledWith(1, 'pm-1');
  });
});
