/**
 * The #933 access bug, pinned.
 *
 * `/arc-requests` redirected everyone failing `isAdminRole` to the dashboard,
 * while `requireArcSubmitterRole` throws unless `role === 'resident'`. The only
 * people permitted to submit an ARC application were therefore the only people
 * who could not reach a single ARC screen, and the entire feature — routes,
 * state machine, decision email, HB 1203 denial validation — shipped
 * unreachable.
 *
 * These tests assert on the redirect, which is the exact thing that was wrong.
 * A test that only rendered the reviewer view would have passed before the fix.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { redirectMock, requireAuthMock, requireMembershipMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    // Next's `redirect` throws to unwind. Mirroring that keeps control flow
    // faithful — without it, execution would continue past the redirect and
    // the test would assert on a page that never renders in production.
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));

vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: requireAuthMock,
}));

vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: requireMembershipMock,
}));

vi.mock('@/components/billing/feature-gate', () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/violations/ArcSubmissionsTab', () => ({
  ArcSubmissionsTab: () => <div data-testid="reviewer-queue" />,
}));

vi.mock('@/components/violations/ResidentArcRequests', () => ({
  ResidentArcRequests: () => <div data-testid="resident-list" />,
}));

import ArcRequestsPage from '@/app/(authenticated)/arc-requests/page';

function membership(role: string) {
  return { role, communityType: 'condo_718', isAdmin: role !== 'resident' };
}

async function renderPage(role: string) {
  return ArcRequestsPage({
    searchParams: Promise.resolve({ communityId: '42' }),
  } as never);
}

describe('/arc-requests access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
  });

  it('no longer bounces a resident to the dashboard', async () => {
    requireMembershipMock.mockResolvedValue(membership('resident'));

    await expect(renderPage('resident')).resolves.toBeDefined();
    expect(redirectMock).not.toHaveBeenCalledWith(
      '/dashboard?reason=insufficient-permissions',
    );
  });

  it('still redirects when the community type has no ARC feature', async () => {
    // The feature gate is a separate axis and must survive the role branch.
    requireMembershipMock.mockResolvedValue({
      role: 'resident',
      communityType: 'apartment',
      isAdmin: false,
    });

    await expect(renderPage('resident')).rejects.toThrow(
      'NEXT_REDIRECT:/dashboard?reason=feature-unavailable',
    );
  });

  it('rejects an invalid communityId before touching auth', async () => {
    await expect(
      ArcRequestsPage({ searchParams: Promise.resolve({ communityId: 'nope' }) } as never),
    ).rejects.toThrow('NEXT_REDIRECT:/dashboard?reason=invalid-selection');
    expect(requireAuthMock).not.toHaveBeenCalled();
  });
});
