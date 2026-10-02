/**
 * Page-side consumers of the user-keyed community lists pass the support-session
 * scope, so an impersonated multi-community user is routed as a single-community
 * user of the consented community — never into a cross-community view.
 *
 *   /dashboard (no tenant)  → getAuthorizedCommunityIds(userId, scope)
 *   /dashboard/overview     → getAuthorizedCommunityIds(userId, scope)
 *   help pages (no tenant)  → listCommunitiesForUser, narrowed
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requestHeaders,
  redirectMock,
  getAuthorizedCommunityIdsMock,
  listCommunitiesForUserMock,
} = vi.hoisted(() => ({
  requestHeaders: { current: new Headers() },
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  getAuthorizedCommunityIdsMock: vi.fn(),
  listCommunitiesForUserMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('next/headers', () => ({ headers: async () => requestHeaders.current }));
vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: vi.fn(async () => 'user-1'),
}));
vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: vi.fn(async () => 'user-1') }));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: vi.fn(),
}));
vi.mock('@/lib/tenant/resolve-community-context', () => ({
  resolveCommunityContext: vi.fn(() => ({ communityId: null })),
  resolvePageCommunityContext: vi.fn(() => ({ communityId: null })),
}));
vi.mock('@/lib/tenant/community-resolution', () => ({
  toUrlSearchParams: vi.fn(() => new URLSearchParams()),
}));
vi.mock('@/lib/queries/cross-community', () => ({
  getAuthorizedCommunityIds: getAuthorizedCommunityIdsMock,
}));
vi.mock('@/lib/api/user-communities', () => ({
  listCommunitiesForUser: listCommunitiesForUserMock,
}));
// Render-path dependencies of the dashboard page — never reached here.
vi.mock('@/lib/dashboard/load-dashboard-data', () => ({ loadDashboardData: vi.fn() }));
vi.mock('@/lib/db/access-control', () => ({ checkPermissionV2: vi.fn(() => true) }));
vi.mock('@/lib/api/branding', () => ({ getCommunityPublicInfo: vi.fn() }));
vi.mock('@/components/onboarding/founding-aha-panel', () => ({ FoundingAhaPanel: () => null }));
vi.mock('@/components/onboarding/onboarding-checklist', () => ({ OnboardingChecklist: () => null }));
vi.mock('@/components/dashboard/dashboard-welcome', () => ({ DashboardWelcome: () => null }));
vi.mock('@/components/dashboard/dashboard-announcements', () => ({ DashboardAnnouncements: () => null }));
vi.mock('@/components/dashboard/dashboard-meetings', () => ({ DashboardMeetings: () => null }));
vi.mock('@/components/dashboard/dashboard-violations', () => ({ DashboardViolations: () => null }));
vi.mock('@/components/dashboard/dashboard-esign-pending', () => ({ DashboardEsignPending: () => null }));
vi.mock('@/components/dashboard/ClaimRootBanner', () => ({ ClaimRootBanner: () => null }));
vi.mock('@/components/ErrorBoundary', () => ({ ErrorBoundary: () => null }));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => null }));
vi.mock('../../../src/app/(authenticated)/dashboard/overview/overview-client', () => ({
  OverviewClient: () => null,
}));

import DashboardPage from '../../../src/app/(authenticated)/dashboard/page';
import OverviewPage from '../../../src/app/(authenticated)/dashboard/overview/page';
import { requireHelpPageContext } from '@/lib/help/page-context';

const SUPPORT = new Headers({ 'x-support-session-id': '7', 'x-support-community-id': '2' });

beforeEach(() => {
  vi.clearAllMocks();
  requestHeaders.current = new Headers();
  // The real helper narrows on the scope it is given (see
  // __tests__/overview/authorized-community-ids.test.ts); model that here so a
  // page that drops the scope routes the wrong way.
  getAuthorizedCommunityIdsMock.mockImplementation(
    async (_userId: string, scope: { communityId: number | null } | null) =>
      scope ? (scope.communityId === null ? [] : [scope.communityId]) : [1, 2],
  );
  listCommunitiesForUserMock.mockResolvedValue([{ communityId: 1 }, { communityId: 2 }]);
});

describe('/dashboard with no tenant context', () => {
  const render = () => DashboardPage({ searchParams: Promise.resolve({}) });

  it('support session: single-community routing (no cross-community overview)', async () => {
    requestHeaders.current = SUPPORT;
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/select-community');
    expect(getAuthorizedCommunityIdsMock).toHaveBeenCalledWith('user-1', { communityId: 2 });
  });

  it('control: a multi-community user gets the overview', async () => {
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/dashboard/overview');
    expect(getAuthorizedCommunityIdsMock).toHaveBeenCalledWith('user-1', null);
  });
});

describe('/dashboard/overview', () => {
  it('support session: bounced to the single-community dashboard', async () => {
    requestHeaders.current = SUPPORT;
    await expect(OverviewPage()).rejects.toThrow('NEXT_REDIRECT:/dashboard');
    expect(getAuthorizedCommunityIdsMock).toHaveBeenCalledWith('user-1', { communityId: 2 });
  });

  it('control: a multi-community user sees the overview', async () => {
    await expect(OverviewPage()).resolves.toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe('help page context with no tenant context', () => {
  const resolve = () => requireHelpPageContext({}, '/help');

  it('support session: routes into the consented community only', async () => {
    requestHeaders.current = SUPPORT;
    await expect(resolve()).rejects.toThrow('NEXT_REDIRECT:/help?communityId=2');
  });

  it('control: a multi-community user is sent to the picker', async () => {
    await expect(resolve()).rejects.toThrow('NEXT_REDIRECT:/select-community');
  });
});
