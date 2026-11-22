/**
 * Pins which Packages view each viewer gets. The real `isAdminRole` and
 * `getFeaturesForCommunity` run (both pure), so role semantics are not mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { membershipMock, previewMock } = vi.hoisted(() => ({
  membershipMock: vi.fn(),
  previewMock: vi.fn(),
}));

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
vi.mock('@/lib/design-preview', () => ({ isDesignPreviewOn: previewMock }));
vi.mock('@/lib/access/describe-access', () => ({ describeAccess: vi.fn(() => []) }));
vi.mock('@/components/billing/feature-gate', () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="feature-gate">{children}</div>
  ),
}));
vi.mock('@/components/shared/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/packages/packages-staff-page', () => ({
  PackagesStaffPage: () => <div data-testid="pilot-staff" />,
}));
vi.mock('@/components/packages/packages-resident-page', () => ({
  PackagesResidentPage: () => <div data-testid="pilot-resident" />,
}));
vi.mock('@/components/packages/PackageStaffView', () => ({
  PackageStaffView: () => <div data-testid="old-staff" />,
}));
vi.mock('@/components/packages/PackageResidentView', () => ({
  PackageResidentView: () => <div data-testid="old-resident" />,
}));

import PackagesPage from '@/app/(authenticated)/dashboard/packages/page';

async function renderPage(role: 'resident' | 'property_manager', preview: boolean) {
  membershipMock.mockResolvedValue({ role, communityType: 'apartment' });
  previewMock.mockResolvedValue(preview);
  const el = await PackagesPage({ searchParams: Promise.resolve({ communityId: '1' }) });
  render(el);
  // Every view must sit inside the feature gate.
  const gate = screen.getByTestId('feature-gate');
  const ids = ['pilot-staff', 'pilot-resident', 'old-staff', 'old-resident'].filter((id) =>
    screen.queryByTestId(id),
  );
  expect(ids).toHaveLength(1);
  expect(gate).toContainElement(screen.getByTestId(ids[0]!));
  return ids[0];
}

describe('PackagesPage view selection', () => {
  beforeEach(() => {
    membershipMock.mockReset();
    previewMock.mockReset();
  });

  it('gives a resident on the allow-list the resident pilot, not the staff pilot', async () => {
    expect(await renderPage('resident', true)).toBe('pilot-resident');
    expect(screen.queryByTestId('pilot-staff')).toBeNull();
  });

  it('gives a manager on the allow-list the staff pilot', async () => {
    expect(await renderPage('property_manager', true)).toBe('pilot-staff');
  });

  it('gives a manager off the allow-list the current staff view', async () => {
    expect(await renderPage('property_manager', false)).toBe('old-staff');
  });

  it('gives a resident off the allow-list the current resident view', async () => {
    expect(await renderPage('resident', false)).toBe('old-resident');
  });
});
