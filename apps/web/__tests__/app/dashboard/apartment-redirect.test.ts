/**
 * Wave 3 C4 — Apartment secondary path.
 *
 * Guarantee: an apartment community lands on the apartment dashboard, never on
 * the condo compliance "founding aha". The generic dashboard redirects
 * apartment communities to /dashboard/apartment BEFORE it computes the
 * founding-aha branch, so a reorder of that logic must not let apartment root
 * managers fall through to condo onboarding/aha.
 *
 * Both cases below are redirect-only paths (the redirect throws before any
 * data-loading or rendering), so the render dependencies are stubbed to keep
 * the test focused on control flow. `@propertypro/shared` is left REAL so the
 * apartment → hasLeaseTracking gating is exercised faithfully.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveCommunityContextMock,
  loadWizardStateMock,
  getAuthorizedCommunityIdsMock,
  redirectMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveCommunityContextMock: vi.fn(),
  loadWizardStateMock: vi.fn(),
  getAuthorizedCommunityIdsMock: vi.fn(),
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
  headers: vi.fn(async () => ({ get: (_key: string) => null })),
}));

vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/tenant/resolve-community-context', () => ({
  resolveCommunityContext: resolveCommunityContextMock,
}));

vi.mock('@/lib/tenant/community-resolution', () => ({
  toUrlSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/lib/queries/wizard-state', () => ({
  loadWizardState: loadWizardStateMock,
}));

vi.mock('@/lib/queries/cross-community', () => ({
  getAuthorizedCommunityIds: getAuthorizedCommunityIdsMock,
}));

// Render-path dependencies — never reached on a redirect, but imported at
// module load, so stub them to avoid pulling in heavy transitive modules.
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

import DashboardPage from '../../../src/app/(authenticated)/dashboard/page';

const APARTMENT_MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'root_manager',
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'apartment',
  communityName: 'Sunset Ridge Apartments',
  subscriptionPlan: 'essentials',
  designation: null,
};

const CONDO_MEMBERSHIP = {
  ...APARTMENT_MEMBERSHIP,
  communityType: 'condo_718',
  communityName: 'Sunset Condos',
};

describe('DashboardPage — Wave 3 C4 apartment routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveCommunityContextMock.mockReturnValue({ communityId: 42 });
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
  });

  it('redirects an apartment community to the apartment dashboard (not the condo aha)', async () => {
    requireCommunityMembershipMock.mockResolvedValue(APARTMENT_MEMBERSHIP);

    await expect(
      DashboardPage({ searchParams: Promise.resolve({ communityId: '42' }) }),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith('/dashboard/apartment?communityId=42');
    // The apartment redirect fires before wizard/aha logic is consulted.
    expect(loadWizardStateMock).not.toHaveBeenCalled();
  });

  it('does NOT send a condo community to the apartment dashboard', async () => {
    requireCommunityMembershipMock.mockResolvedValue(CONDO_MEMBERSHIP);
    // Condo with an incomplete wizard → condo onboarding, never apartment.
    loadWizardStateMock.mockResolvedValue({ status: 'in_progress' });

    await expect(
      DashboardPage({ searchParams: Promise.resolve({ communityId: '42' }) }),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith('/onboarding/condo?communityId=42');
    expect(redirectMock).not.toHaveBeenCalledWith(
      '/dashboard/apartment?communityId=42',
    );
  });
});
