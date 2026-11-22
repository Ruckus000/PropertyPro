/**
 * Pins which Visitors view each viewer gets. The real `isAdminRole` and
 * `getFeaturesForCommunity` run (both pure), so role semantics are not mocked.
 * There is no pilot resident view for visitors: a resident always gets the
 * current one.
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
vi.mock('@propertypro/db', () => ({
  communities: {},
  createScopedClient: () => ({ selectFrom: async () => [{ communitySettings: {} }] }),
}));
vi.mock('@propertypro/db/filters', () => ({ eq: () => ({}) }));
vi.mock('@/lib/units/actor-units', () => ({ listActorUnitIds: async () => [] }));
vi.mock('@/lib/services/units-lookup', () => ({ getUnitLabelMap: async () => new Map() }));
vi.mock('@/lib/design-preview', () => ({ isDesignPreviewOn: previewMock }));
vi.mock('@/lib/access/describe-access', () => ({ describeAccess: vi.fn(() => undefined) }));
vi.mock('@/components/billing/feature-gate', () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="feature-gate">{children}</div>
  ),
}));
vi.mock('@/components/shared/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/visitors/visitors-staff-page', () => ({
  VisitorsStaffPage: () => <div data-testid="pilot-staff" />,
}));
vi.mock('@/components/visitors/VisitorStaffView', () => ({
  VisitorStaffView: () => <div data-testid="old-staff" />,
}));
vi.mock('@/components/visitors/VisitorResidentView', () => ({
  VisitorResidentView: () => <div data-testid="old-resident" />,
}));

import VisitorsPage from '@/app/(authenticated)/dashboard/visitors/page';

async function renderPage(role: 'resident' | 'property_manager', preview: boolean) {
  membershipMock.mockResolvedValue({ role, communityType: 'apartment' });
  previewMock.mockResolvedValue(preview);
  const el = await VisitorsPage({ searchParams: Promise.resolve({ communityId: '1' }) });
  render(el);
  const gate = screen.getByTestId('feature-gate');
  const ids = ['pilot-staff', 'old-staff', 'old-resident'].filter((id) => screen.queryByTestId(id));
  expect(ids).toHaveLength(1);
  expect(gate).toContainElement(screen.getByTestId(ids[0]!));
  return ids[0];
}

describe('VisitorsPage view selection', () => {
  beforeEach(() => {
    membershipMock.mockReset();
    previewMock.mockReset();
  });

  it('gives a manager on the allow-list the staff pilot', async () => {
    expect(await renderPage('property_manager', true)).toBe('pilot-staff');
  });

  it('gives a resident on the allow-list the CURRENT resident view', async () => {
    expect(await renderPage('resident', true)).toBe('old-resident');
  });

  it('gives a manager off the allow-list the current staff view', async () => {
    expect(await renderPage('property_manager', false)).toBe('old-staff');
  });

  it('gives a resident off the allow-list the current resident view', async () => {
    expect(await renderPage('resident', false)).toBe('old-resident');
  });
});
