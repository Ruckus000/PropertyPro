/**
 * Pins which Packages view each viewer gets. The real `isAdminRole` and
 * `getFeaturesForCommunity` run (both pure), so role semantics are not mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { membershipMock } = vi.hoisted(() => ({ membershipMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
}));
vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: vi.fn(async () => 'user-1'),
}));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: membershipMock,
}));
vi.mock('@/lib/access/describe-access', () => ({ describeAccess: vi.fn(() => []) }));
vi.mock('@/components/billing/feature-gate', () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="feature-gate">{children}</div>
  ),
}));
vi.mock('@/components/packages/packages-staff-page', () => ({
  PackagesStaffPage: () => <div data-testid="staff" />,
}));
vi.mock('@/components/packages/packages-resident-page', () => ({
  PackagesResidentPage: () => <div data-testid="resident" />,
}));
import PackagesPage from '@/app/(authenticated)/dashboard/packages/page';

async function renderPage(role: 'resident' | 'property_manager') {
  membershipMock.mockResolvedValue({ role, communityType: 'apartment' });
  const el = await PackagesPage({ searchParams: Promise.resolve({ communityId: '1' }) });
  render(el);
  // Every view must sit inside the feature gate.
  const gate = screen.getByTestId('feature-gate');
  const ids = ['staff', 'resident'].filter((id) => screen.queryByTestId(id));
  expect(ids).toHaveLength(1);
  expect(gate).toContainElement(screen.getByTestId(ids[0]!));
  return ids[0];
}

describe('PackagesPage view selection', () => {
  beforeEach(() => {
    membershipMock.mockReset();
  });

  it('gives a resident the resident page, not the staff page', async () => {
    expect(await renderPage('resident')).toBe('resident');
  });

  it('gives a manager the staff page', async () => {
    expect(await renderPage('property_manager')).toBe('staff');
  });
});
