/**
 * Real pages on a tenant subdomain (sunset-condos.<root>): they must resolve
 * the community from middleware's forwarded id, not fall back to "Add a valid
 * communityId". The Directory as the sample.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { membershipMock, headerState } = vi.hoisted(() => ({
  membershipMock: vi.fn(),
  headerState: { value: new Headers() },
}));

vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => headerState.value }));
vi.mock('@/lib/tenant/community-resolution', () => ({
  toUrlSearchParams: (sp: Record<string, string | undefined>) =>
    new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => e[1] != null)),
}));
vi.mock('@/lib/request/page-auth-context', () => ({ requirePageAuthenticatedUserId: async () => 'pm-1' }));
vi.mock('@/lib/request/page-community-context', () => ({ requirePageCommunityMembership: membershipMock }));
vi.mock('@/lib/db/access-control', () => ({ requirePermission: vi.fn(), checkPermissionV2: () => true }));
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: async () => undefined }));
vi.mock('@/components/directory/directory-page-client', () => ({ DirectoryPageClient: () => null }));

import DirectoryPage from '../../../src/app/(authenticated)/dashboard/directory/page';

describe('pages on a tenant subdomain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membershipMock.mockResolvedValue({ isAdmin: true, communityType: 'condo_718', isUnitOwner: false, role: 'property_manager' });
    headerState.value = new Headers({ host: 'sunset-condos.getpropertypro.com', 'x-community-id': '1' });
  });

  it('/dashboard/directory resolves the community from the subdomain — not "Add a valid communityId"', async () => {
    await DirectoryPage({ searchParams: Promise.resolve({}) });
    expect(membershipMock).toHaveBeenCalledWith(1, 'pm-1');
  });
});
