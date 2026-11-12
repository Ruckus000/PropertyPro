/**
 * Communities sends someone who manages exactly one community straight to that
 * community's dashboard, except when the URL carries a message for this page
 * (`?reason=`, `?added_session_id=`) or an Add Community checkout is on its way.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  isPm: vi.fn(),
  sole: vi.fn(),
  checkoutOpen: vi.fn(),
  target: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: h.redirect }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: vi.fn(async () => 'pm-user'),
}));
vi.mock('@/lib/api/pm-communities', () => ({
  isPmAdminInAnyCommunity: h.isPm,
  findSoleManagedCommunityId: h.sole,
  hasOpenAddCommunityCheckout: h.checkoutOpen,
}));
vi.mock('@/lib/api/community-context', () => ({ resolvePmDashboardTarget: h.target }));
vi.mock('@/lib/services/site-portfolio-template-service', () => ({
  userHasPortfolioTemplatesAccess: vi.fn(async () => false),
}));
vi.mock('@/components/pm/PmDashboardClient', () => ({ PmDashboardClient: () => null }));

import PmCommunitiesPage from '../../src/app/(authenticated)/pm/dashboard/communities/page';

function visit(query: Record<string, string> = {}) {
  return PmCommunitiesPage({ searchParams: Promise.resolve(query) });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.isPm.mockResolvedValue(true);
  h.sole.mockResolvedValue(5);
  h.checkoutOpen.mockResolvedValue(false);
  h.target.mockResolvedValue('/dashboard?communityId=5');
});

describe('one managed community', () => {
  it('goes straight to its dashboard, resolved like any community switch', async () => {
    await expect(visit()).rejects.toThrow(/^NEXT_REDIRECT:\/dashboard\?communityId=5$/);
    expect(h.sole).toHaveBeenCalledWith('pm-user');
    expect(h.target).toHaveBeenCalledWith('pm-user', 5);
  });

  it('uses the apartment dashboard when the resolver says so', async () => {
    h.target.mockResolvedValue('/dashboard/apartment?communityId=5');
    await expect(visit()).rejects.toThrow(/^NEXT_REDIRECT:\/dashboard\/apartment\?communityId=5$/);
  });

  it('stays when another page sent them here with a reason', async () => {
    await expect(visit({ reason: 'feature-unavailable' })).resolves.toBeDefined();
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it('treats an empty ?reason= as a message too', async () => {
    await expect(visit({ reason: '' })).resolves.toBeDefined();
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it('stays on the way back from an Add Community checkout, to show the confirmation', async () => {
    await expect(visit({ added_session_id: 'cs_test_123' })).resolves.toBeDefined();
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it('stays while an Add Community checkout is open or being set up', async () => {
    h.checkoutOpen.mockResolvedValue(true);
    await expect(visit()).resolves.toBeDefined();
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it('stays, rather than looping, when the community no longer resolves', async () => {
    h.target.mockResolvedValue(null);
    await expect(visit()).resolves.toBeDefined();
    expect(h.redirect).not.toHaveBeenCalled();
  });
});

describe('control', () => {
  it('renders the page for someone who manages several communities', async () => {
    h.sole.mockResolvedValue(null);
    await expect(visit()).resolves.toBeDefined();
    expect(h.redirect).not.toHaveBeenCalled();
    expect(h.target).not.toHaveBeenCalled();
  });

  it('still sends a non-manager to /dashboard first', async () => {
    h.isPm.mockResolvedValue(false);
    await expect(visit()).rejects.toThrow(/^NEXT_REDIRECT:\/dashboard$/);
    expect(h.sole).not.toHaveBeenCalled();
  });
});
