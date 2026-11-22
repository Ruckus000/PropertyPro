/**
 * Who gets the apartment dashboard's "Add Tenant" action.
 *
 * The page decides with the REAL permission matrix (`checkPermissionV2` is
 * pure, so it is not mocked here): residents:write, which only the two
 * manager roles hold in an apartment community. Tenants see this dashboard
 * too, and used to get an "Add Tenant" button they could not use.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';

const { requireAuthMock, requireMembershipMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/request/page-auth-context', () => ({ requirePageAuthenticatedUserId: requireAuthMock }));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: requireMembershipMock,
}));
vi.mock('@/lib/tenant/resolve-community-context', () => ({
  resolvePageCommunityContext: () => ({ communityId: 42 }),
}));
vi.mock('@/lib/tenant/community-resolution', () => ({ toUrlSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/queries/apartment-metrics', () => ({
  loadApartmentMetrics: vi.fn(async () => ({ communityName: 'Sunset Ridge', firstName: 'Pat', announcements: [] })),
}));
vi.mock('@/lib/dashboard/load-website-live-card', () => ({ loadWebsiteLiveCard: vi.fn(async () => null) }));
vi.mock('@/components/website-home/website-live-card', () => ({ WebsiteLiveCard: () => null }));
vi.mock('@/components/onboarding/onboarding-checklist', () => ({ OnboardingChecklist: () => null }));
vi.mock('@/components/dashboard/dashboard-welcome', () => ({ DashboardWelcome: () => null }));
vi.mock('@/components/dashboard/apartment-dashboard', () => ({
  ApartmentDashboard: function ApartmentDashboard() {
    return null;
  },
}));
vi.mock('@/components/shared/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => null }));

import { ApartmentDashboard } from '@/components/dashboard/apartment-dashboard';
import ApartmentDashboardPage from '@/app/(authenticated)/dashboard/apartment/page';

/** Every element in a tree, awaiting the async server components named in `expand`. */
async function elementsOf(node: ReactNode, expand: string[]): Promise<ReactElement[]> {
  if (Array.isArray(node)) return (await Promise.all(node.map((n) => elementsOf(n, expand)))).flat();
  if (!node || typeof node !== 'object' || !('type' in node)) return [];
  const el = node as ReactElement<{ children?: ReactNode }>;
  const type = el.type as { name?: string };
  const rendered =
    typeof el.type === 'function' && expand.includes(type.name ?? '')
      ? await (el.type as (props: unknown) => Promise<ReactNode>)(el.props)
      : el.props?.children;
  return [el, ...(await elementsOf(rendered, expand))];
}

async function dashboardProps(membership: { role: string; isUnitOwner: boolean }) {
  requireMembershipMock.mockResolvedValue({
    ...membership,
    isAdmin: membership.role !== 'resident',
    communityType: 'apartment',
    subscriptionPlan: 'operations_plus',
  });
  const tree = await elementsOf(await ApartmentDashboardPage({ searchParams: Promise.resolve({}) }), [
    'ApartmentDashboardPanels',
  ]);
  const dashboard = tree.find((e) => e.type === ApartmentDashboard);
  if (!dashboard) throw new Error('ApartmentDashboard was not rendered');
  return dashboard.props as { canManageResidents: boolean; canWriteAnnouncements: boolean };
}

describe('apartment dashboard: who may add a tenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
  });

  it.each(['property_manager', 'root_manager'])('a %s gets Add Tenant', async (role) => {
    expect(await dashboardProps({ role, isUnitOwner: false })).toMatchObject({ canManageResidents: true });
  });

  it('a tenant does not', async () => {
    expect(await dashboardProps({ role: 'resident', isUnitOwner: false })).toMatchObject({
      canManageResidents: false,
    });
  });

  it('a resident flagged as a unit owner does not either', async () => {
    expect(await dashboardProps({ role: 'resident', isUnitOwner: true })).toMatchObject({
      canManageResidents: false,
    });
  });
});
