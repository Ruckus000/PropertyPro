/**
 * Who sees the dashboard's "Your website is live" card (website builder, D18).
 *
 * Two layers, both server-side and DB-free:
 *   - `loadWebsiteLiveCard` decides: a manager, on a plan with the site
 *     editor, while `site_onboarding_completed_at` is null. The role check is
 *     real; only the two community reads are mocked.
 *   - Both dashboards (the main one and the apartment one) put the card first,
 *     above the onboarding checklist, and only when the loader returns data. The
 *     page is called and the element it returns is walked, as the look picker's
 *     page tests do.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { getFeaturesForCommunity } from '@propertypro/shared';

const {
  getSiteOnboardingCompletedAtMock,
  getCommunityPublicInfoMock,
  requireAuthMock,
  requireMembershipMock,
  loadCardMock,
} = vi.hoisted(() => ({
  getSiteOnboardingCompletedAtMock: vi.fn(),
  getCommunityPublicInfoMock: vi.fn(),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  loadCardMock: vi.fn(),
}));

vi.mock('@/lib/api/branding', () => ({
  getSiteOnboardingCompletedAt: getSiteOnboardingCompletedAtMock,
  getCommunityPublicInfo: getCommunityPublicInfoMock,
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
vi.mock('@/lib/queries/cross-community', () => ({ getAuthorizedCommunityIds: vi.fn() }));
vi.mock('@/lib/db/access-control', () => ({ checkPermissionV2: () => true, canActAsBoard: () => false }));
vi.mock('@/lib/dashboard/load-dashboard-data', () => ({
  loadDashboardData: vi.fn(async () => ({
    communityName: 'Sunset Condos',
    firstName: 'Pat',
    announcements: [],
    meetings: [],
    timezone: 'America/New_York',
    violationSummary: null,
    pendingSigners: [],
  })),
}));
vi.mock('@/lib/queries/apartment-metrics', () => ({
  loadApartmentMetrics: vi.fn(async () => ({ communityName: 'Sunset Ridge', firstName: 'Pat' })),
}));
// The page tests drive the card's data through this mock; the loader's own tests
// reach the real function with `vi.importActual` below.
vi.mock('@/lib/dashboard/load-website-live-card', () => ({
  loadWebsiteLiveCard: (...args: unknown[]) => loadCardMock(...args),
}));
vi.mock('@/components/website-home/website-live-card', () => ({ WebsiteLiveCard: function WebsiteLiveCard() { return null; } }));
vi.mock('@/components/onboarding/onboarding-checklist', () => ({ OnboardingChecklist: function OnboardingChecklist() { return null; } }));
vi.mock('@/components/dashboard/dashboard-welcome', () => ({ DashboardWelcome: function DashboardWelcome() { return null; } }));
vi.mock('@/components/dashboard/apartment-dashboard', () => ({ ApartmentDashboard: function ApartmentDashboard() { return null; } }));
vi.mock('@/components/dashboard/dashboard-announcements', () => ({ DashboardAnnouncements: () => null }));
vi.mock('@/components/dashboard/dashboard-meetings', () => ({ DashboardMeetings: () => null }));
vi.mock('@/components/dashboard/dashboard-violations', () => ({ DashboardViolations: () => null }));
vi.mock('@/components/dashboard/dashboard-esign-pending', () => ({ DashboardEsignPending: () => null }));
vi.mock('@/components/dashboard/ClaimRootBanner', () => ({ ClaimRootBanner: () => null }));
vi.mock('@/components/shared/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/ErrorBoundary', () => ({ ErrorBoundary: function ErrorBoundary() { return null; } }));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => null }));

import type { loadWebsiteLiveCard as LoadWebsiteLiveCard } from '@/lib/dashboard/load-website-live-card';
import { WebsiteLiveCard } from '@/components/website-home/website-live-card';
import { OnboardingChecklist } from '@/components/onboarding/onboarding-checklist';
import DashboardPage from '@/app/(authenticated)/dashboard/page';
import ApartmentDashboardPage from '@/app/(authenticated)/dashboard/apartment/page';

const condoFeatures = getFeaturesForCommunity('condo_718');
const noEditor = { ...condoFeatures, hasSiteEditor: false };

describe('loadWebsiteLiveCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSiteOnboardingCompletedAtMock.mockResolvedValue(null);
    getCommunityPublicInfoMock.mockResolvedValue({
      slug: 'sunset-condos',
      sitePublishedAt: new Date('2026-09-01T00:00:00Z'),
    });
  });
  const load = async (role: Parameters<typeof LoadWebsiteLiveCard>[1], features = condoFeatures) => {
    const real = await vi.importActual<typeof import('@/lib/dashboard/load-website-live-card')>(
      '@/lib/dashboard/load-website-live-card',
    );
    return real.loadWebsiteLiveCard(42, role, features);
  };

  it('the dashboard shows the card for both manager roles, not residents', async () => {
    const expected = { publicUrl: expect.stringMatching(/^https?:\/\/sunset-condos\./) };
    expect(await load('property_manager')).toEqual(expected);
    expect(await load('root_manager')).toEqual(expected);
    expect(await load('resident')).toBeNull();
    // A resident is refused before anything is read.
    getSiteOnboardingCompletedAtMock.mockClear();
    await load('resident');
    expect(getSiteOnboardingCompletedAtMock).not.toHaveBeenCalled();
  });

  it('never says the website is live for a site that is not published', async () => {
    getCommunityPublicInfoMock.mockResolvedValue({ slug: 'sunset-condos', sitePublishedAt: null });
    expect(await load('root_manager')).toBeNull();
  });

  it('the card hides once onboarding is complete', async () => {
    getSiteOnboardingCompletedAtMock.mockResolvedValue(new Date('2026-10-01T00:00:00Z'));
    expect(await load('root_manager')).toBeNull();
  });

  it('the card hides on a plan without the site editor', async () => {
    expect(await load('root_manager', noEditor)).toBeNull();
  });

  it('shows no card, rather than failing the dashboard, when a read fails', async () => {
    getCommunityPublicInfoMock.mockRejectedValue(new Error('db down'));
    expect(await load('root_manager')).toBeNull();
  });
});

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

const MANAGER = {
  role: 'root_manager',
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718',
  subscriptionPlan: 'professional',
};

describe('the dashboards render the card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
  });

  it('on the main dashboard, above the checklist, which steps down beside it', async () => {
    requireMembershipMock.mockResolvedValue(MANAGER);
    loadCardMock.mockResolvedValue({ publicUrl: 'https://sunset-condos.getpropertypro.com/' });

    const tree = await elementsOf(await DashboardPage({ searchParams: Promise.resolve({}) }), ['DashboardPanels']);

    const types = tree.map((e) => e.type);
    expect(types).toContain(WebsiteLiveCard);
    expect(types.indexOf(WebsiteLiveCard)).toBeLessThan(types.indexOf(OnboardingChecklist));
    const card = tree.find((e) => e.type === WebsiteLiveCard)!;
    expect(card.props).toMatchObject({
      communityId: 42,
      communityName: 'Sunset Condos',
      publicUrl: 'https://sunset-condos.getpropertypro.com/',
    });
    expect(tree.find((e) => e.type === OnboardingChecklist)!.props).toMatchObject({ variant: 'secondary' });
    expect(loadCardMock).toHaveBeenCalledWith(42, 'root_manager', condoFeatures);
  });

  it('on the main dashboard, no card when the loader returns none', async () => {
    requireMembershipMock.mockResolvedValue(MANAGER);
    loadCardMock.mockResolvedValue(null);

    const tree = await elementsOf(await DashboardPage({ searchParams: Promise.resolve({}) }), ['DashboardPanels']);

    expect(tree.map((e) => e.type)).not.toContain(WebsiteLiveCard);
    expect(tree.find((e) => e.type === OnboardingChecklist)!.props).toMatchObject({ variant: 'primary' });
  });

  it('on the apartment dashboard too, above the checklist', async () => {
    requireMembershipMock.mockResolvedValue({ ...MANAGER, communityType: 'apartment' });
    loadCardMock.mockResolvedValue({ publicUrl: 'https://sunset-ridge.getpropertypro.com/' });

    const tree = await elementsOf(await ApartmentDashboardPage({ searchParams: Promise.resolve({}) }), [
      'ApartmentDashboardPanels',
    ]);

    const types = tree.map((e) => e.type);
    expect(types).toContain(WebsiteLiveCard);
    expect(types.indexOf(WebsiteLiveCard)).toBeLessThan(types.indexOf(OnboardingChecklist));
    expect(tree.find((e) => e.type === WebsiteLiveCard)!.props).toMatchObject({
      communityId: 42,
      publicUrl: 'https://sunset-ridge.getpropertypro.com/',
    });
  });

  it('on the apartment dashboard, no card when the loader returns none', async () => {
    requireMembershipMock.mockResolvedValue({ ...MANAGER, role: 'resident', communityType: 'apartment' });
    loadCardMock.mockResolvedValue(null);

    const tree = await elementsOf(await ApartmentDashboardPage({ searchParams: Promise.resolve({}) }), [
      'ApartmentDashboardPanels',
    ]);

    expect(tree.map((e) => e.type)).not.toContain(WebsiteLiveCard);
  });
});
