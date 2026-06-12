/**
 * Settings → Roles & Access — server-page gate tests (role-v3 Phase 2c).
 *
 * Verifies that the page redirects non-root visitors and allows the root
 * manager through without redirecting. The interactive surface lives in the
 * client component; these tests only exercise the server gate logic.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requirePageAuthenticatedUserIdMock,
  requirePageCommunityMembershipMock,
  resolveCommunityContextMock,
  redirectMock,
} = vi.hoisted(() => ({
  requirePageAuthenticatedUserIdMock: vi.fn(),
  requirePageCommunityMembershipMock: vi.fn(),
  resolveCommunityContextMock: vi.fn(),
  redirectMock: vi.fn(),
}));

class RedirectError extends Error {
  constructor(url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => {
    redirectMock(...args);
    throw new RedirectError(String(args[0]));
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (_key: string) => null,
  })),
}));

vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: requirePageAuthenticatedUserIdMock,
}));

vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: requirePageCommunityMembershipMock,
}));

vi.mock('@/lib/tenant/resolve-community-context', () => ({
  resolveCommunityContext: resolveCommunityContextMock,
}));

vi.mock('@/lib/tenant/community-resolution', () => ({
  toUrlSearchParams: vi.fn(() => new URLSearchParams()),
}));

// Stub rendered components so JSX evaluation under node doesn't pull in
// client-only modules.
vi.mock('@/components/settings/RolesAccessClient', () => ({
  RolesAccessClient: () => null,
}));

vi.mock('@/components/shared/page-header', () => ({
  PageHeader: () => null,
}));

vi.mock('@/components/shared/breadcrumbs', () => ({
  Breadcrumbs: () => null,
}));

import RolesAccessPage from '../../../src/app/(authenticated)/settings/roles/page';

describe('RolesAccessPage gate', () => {
  const COMMUNITY_ID = 7;

  beforeEach(() => {
    vi.clearAllMocks();
    resolveCommunityContextMock.mockReturnValue({ communityId: COMMUNITY_ID });
    requirePageAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requirePageCommunityMembershipMock.mockResolvedValue({
      userId: 'user-1',
      communityId: COMMUNITY_ID,
      role: 'root_manager',
      isAdmin: true,
      isUnitOwner: false,
      displayTitle: 'Root Manager',
      communityType: 'condo_718',
      communityName: 'X',
      city: 'Miami',
      state: 'FL',
      presetKey: 'root_manager',
    });
  });

  it('redirects to /select-community when communityId is absent', async () => {
    resolveCommunityContextMock.mockReturnValue({ communityId: null });

    await expect(
      RolesAccessPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith('/select-community');
  });

  it('redirects non-root members to the dashboard', async () => {
    requirePageCommunityMembershipMock.mockResolvedValue({
      userId: 'user-1',
      communityId: COMMUNITY_ID,
      role: 'manager',
      isAdmin: true,
      isUnitOwner: false,
      displayTitle: 'Manager',
      communityType: 'condo_718',
      communityName: 'X',
      city: 'Miami',
      state: 'FL',
      presetKey: 'manager',
    });

    await expect(
      RolesAccessPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(
      expect.stringContaining('/dashboard'),
    );
  });

  it('does not redirect the root_manager', async () => {
    // role is 'root_manager' from beforeEach — no redirect should fire.
    await RolesAccessPage({ searchParams: Promise.resolve({}) });

    expect(redirectMock).not.toHaveBeenCalled();
  });
});
