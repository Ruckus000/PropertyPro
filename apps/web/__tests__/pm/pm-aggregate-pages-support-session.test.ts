/**
 * PM portfolio AGGREGATE pages refuse a support session; the per-community
 * context switch accepts only the consented community.
 *
 * Inventory of `(authenticated)/pm/**` pages (2026-09-29):
 *   aggregate (deny)  — dashboard/communities, reports, portfolio/templates
 *   per-community     — dashboard/[community_id] (narrowed: consented id only),
 *                       onboarding/website (resolves membership for ?communityId,
 *                       which middleware pins to the session community)
 *   redirect-only     — dashboard/communities/new, settings/branding,
 *                       settings/website (no data read)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  redirectMock,
  requestHeaders,
  isPmAdminInAnyCommunityMock,
  listManagedCommunitiesForPmMock,
  resolvePmDashboardTargetMock,
  userHasPortfolioTemplatesAccessMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  requestHeaders: { current: new Headers() },
  isPmAdminInAnyCommunityMock: vi.fn(),
  listManagedCommunitiesForPmMock: vi.fn(),
  resolvePmDashboardTargetMock: vi.fn(),
  userHasPortfolioTemplatesAccessMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('next/headers', () => ({ headers: async () => requestHeaders.current }));
vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: vi.fn(async () => 'pm-user'),
}));
vi.mock('@/lib/api/pm-communities', () => ({
  isPmAdminInAnyCommunity: isPmAdminInAnyCommunityMock,
  listManagedCommunitiesForPm: listManagedCommunitiesForPmMock,
}));
vi.mock('@/lib/api/community-context', () => ({
  resolvePmDashboardTarget: resolvePmDashboardTargetMock,
}));
vi.mock('@/lib/services/site-portfolio-template-service', () => ({
  userHasPortfolioTemplatesAccess: userHasPortfolioTemplatesAccessMock,
}));
vi.mock('@/components/pm/PmDashboardClient', () => ({ PmDashboardClient: () => null }));
vi.mock('@/components/pm/reports/PmReportsClient', () => ({ PmReportsClient: () => null }));
vi.mock('@/components/pm/portfolio/PortfolioTemplatesManager', () => ({
  PortfolioTemplatesManager: () => null,
}));
vi.mock('@/components/shared/page-body', () => ({ PageBody: () => null }));
vi.mock('@/components/shared/page-header', () => ({ PageHeader: () => null }));

import PmCommunitiesPage from '../../src/app/(authenticated)/pm/dashboard/communities/page';
import PmReportsPage from '../../src/app/(authenticated)/pm/reports/page';
import PortfolioTemplatesPage from '../../src/app/(authenticated)/pm/portfolio/templates/page';
import PmCommunityPage from '../../src/app/(authenticated)/pm/dashboard/[community_id]/page';

const SUPPORT = new Headers({
  'x-support-session-id': '7',
  'x-support-community-id': '5',
  'x-community-id': '5',
});

const AGGREGATE_PAGES = [
  ['pm/dashboard/communities', () => PmCommunitiesPage()],
  ['pm/reports', () => PmReportsPage()],
  ['pm/portfolio/templates', () => PortfolioTemplatesPage()],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  requestHeaders.current = new Headers();
  isPmAdminInAnyCommunityMock.mockResolvedValue(true);
  listManagedCommunitiesForPmMock.mockResolvedValue([
    { communityId: 5, communityName: 'Consented' },
    { communityId: 6, communityName: 'Not consented' },
  ]);
  userHasPortfolioTemplatesAccessMock.mockResolvedValue(true);
});

describe.each(AGGREGATE_PAGES)('%s (portfolio aggregate)', (_name, render) => {
  it('redirects a support session to /dashboard without reading the portfolio', async () => {
    requestHeaders.current = SUPPORT;

    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/dashboard');
    expect(isPmAdminInAnyCommunityMock).not.toHaveBeenCalled();
    expect(listManagedCommunitiesForPmMock).not.toHaveBeenCalled();
  });

  it('control: renders for a PM outside a support session', async () => {
    await expect(render()).resolves.toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(isPmAdminInAnyCommunityMock).toHaveBeenCalledWith('pm-user');
  });
});

describe('pm/dashboard/[community_id] (per-community switch)', () => {
  function render(id: string) {
    return PmCommunityPage({ params: Promise.resolve({ community_id: id }) });
  }

  it('refuses a support session steering at a non-consented community', async () => {
    requestHeaders.current = SUPPORT;

    await expect(render('6')).rejects.toThrow(
      'NEXT_REDIRECT:/pm/dashboard/communities?reason=invalid-selection',
    );
    expect(resolvePmDashboardTargetMock).not.toHaveBeenCalled();
  });

  it('lets a support session switch to its consented community', async () => {
    requestHeaders.current = SUPPORT;
    resolvePmDashboardTargetMock.mockResolvedValue('/dashboard?communityId=5');

    await expect(render('5')).rejects.toThrow('NEXT_REDIRECT:/dashboard?communityId=5');
    expect(resolvePmDashboardTargetMock).toHaveBeenCalledWith('pm-user', 5);
  });

  it('control: any managed community outside a support session', async () => {
    resolvePmDashboardTargetMock.mockResolvedValue('/dashboard?communityId=6');

    await expect(render('6')).rejects.toThrow('NEXT_REDIRECT:/dashboard?communityId=6');
  });
});
