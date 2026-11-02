// @vitest-environment jsdom
/**
 * The condo/HOA dashboard page composes the urgency-first overview (D13-D20).
 * The page is called and `DashboardPanels` is rendered for real; only the
 * loaders, auth and the two heavy children (checklist, activity feed) are mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

const NOW = new Date();

const mocks = vi.hoisted(() => ({
  membership: { current: {} as Record<string, unknown> },
  requestHeaders: { current: new Headers() },
  data: { current: {} as Record<string, unknown> },
  overview: { current: {} as Record<string, unknown> },
  canWrite: { current: (_r: string, _t: string, _resource: string) => true as boolean },
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock('next/headers', () => ({ headers: async () => mocks.requestHeaders.current }));
vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: async () => 'user-1',
}));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: async () => mocks.membership.current,
}));
vi.mock('@/lib/tenant/resolve-community-context', () => ({
  resolvePageCommunityContext: () => ({ communityId: 42 }),
}));
vi.mock('@/lib/tenant/community-resolution', () => ({ toUrlSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/queries/cross-community', () => ({ getAuthorizedCommunityIds: vi.fn() }));
vi.mock('@/lib/db/access-control', () => ({
  canActAsBoard: (m: { isAdmin: boolean; designation: string | null }) => m.isAdmin || m.designation !== null,
  checkPermissionV2: (role: string, type: string, resource: string) => mocks.canWrite.current(role, type, resource),
}));
vi.mock('@/lib/dashboard/load-dashboard-data', () => ({ loadDashboardData: async () => mocks.data.current }));
vi.mock('@/lib/dashboard/load-dashboard-overview', () => ({
  loadDashboardOverview: async () => mocks.overview.current,
}));
vi.mock('@/lib/dashboard/load-website-live-card', () => ({ loadWebsiteLiveCard: async () => null }));
vi.mock('@/components/website-home/website-live-card', () => ({ WebsiteLiveCard: () => null }));
vi.mock('@/components/onboarding/onboarding-checklist', () => ({ OnboardingChecklist: () => null }));
vi.mock('@/components/dashboard/ClaimRootBanner', () => ({ ClaimRootBanner: () => null }));
vi.mock('@/components/shared/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/ErrorBoundary', () => ({ ErrorBoundary: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/compliance/compliance-activity-feed', () => ({
  ComplianceActivityFeed: () => <section data-testid="activity-feed" />,
}));

import DashboardPage from '@/app/(authenticated)/dashboard/page';

const MANAGER = {
  role: 'root_manager',
  isAdmin: true,
  isUnitOwner: false,
  designation: null,
  communityType: 'condo_718',
  subscriptionPlan: 'professional',
  communityName: 'Sunset Condos',
  timezone: 'America/New_York',
};
const BOARD = { ...MANAGER, role: 'resident', isAdmin: false, isUnitOwner: true, designation: 'board_member' };
const OWNER = { ...MANAGER, role: 'resident', isAdmin: false, isUnitOwner: true, designation: null };

const NEXT_WEEK = new Date(NOW.getTime() + 3 * 86_400_000);

const OPEN_DATA = {
  communityName: 'Sunset Condos',
  firstName: 'Pat',
  timezone: 'America/New_York',
  announcements: [],
  meetings: [],
  violationSummary: { total: 3, byStatus: { reported: 2, noticed: 1, resolved: 9 } },
  pendingSigners: [],
  openMaintenanceCount: 5,
};

function overviewWith(overrides: Record<string, unknown> = {}) {
  return {
    checklist: {
      ok: true,
      value: [
        {
          id: 1,
          status: 'overdue',
          templateKey: 'x',
          title: 'Post the budget',
          deadline: new Date(NOW.getTime() - 86_400_000).toISOString(),
          statuteReference: '§718.111',
          category: 'financial_records',
          documentId: null,
          documentPostedAt: null,
          isConditional: false,
          isApplicable: true,
        },
      ],
    },
    meetings30d: {
      ok: true,
      value: [{ id: 7, title: 'Board meeting', meetingType: 'board', startsAt: NEXT_WEEK, noticePostedAt: null }],
    },
    hearings: { ok: true, value: [] },
    ...overrides,
  };
}

/** Render the streamed panels of the real page. */
async function renderPage() {
  const tree = (await DashboardPage({ searchParams: Promise.resolve({}) })) as ReactElement;
  const find = (node: ReactNode): ReactElement | null => {
    if (Array.isArray(node)) return node.map(find).find(Boolean) ?? null;
    if (!node || typeof node !== 'object' || !('type' in node)) return null;
    const el = node as ReactElement<{ children?: ReactNode }>;
    if (typeof el.type === 'function' && el.type.name === 'DashboardPanels') return el;
    return find(el.props?.children);
  };
  const panels = find(tree)!;
  const out = await (panels.type as (p: unknown) => Promise<ReactNode>)(panels.props);
  return render(<>{out}</>);
}

beforeEach(() => {
  mocks.membership.current = MANAGER;
  mocks.requestHeaders.current = new Headers();
  mocks.data.current = OPEN_DATA;
  mocks.overview.current = overviewWith();
  mocks.canWrite.current = () => true;
});

describe('the condo dashboard composition', () => {
  it('manager sees hero, queue, agenda, actions, tiles, activity', async () => {
    await renderPage();
    expect(screen.getByText('Needs attention', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByText('1 required item is late.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'This week' })).toBeInTheDocument();
    // Quick action + the announcements card's own button.
    expect(screen.getAllByRole('link', { name: 'New announcement' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Open violations')).toBeInTheDocument();
    expect(screen.getByText('Open maintenance requests')).toBeInTheDocument();
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
  });

  it('board seat sees queue but no activity feed', async () => {
    mocks.membership.current = BOARD;
    mocks.canWrite.current = (_r, _t, resource) => resource !== 'audit';
    await renderPage();
    expect(screen.getByText('Needs attention', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.queryByTestId('activity-feed')).toBeNull();
  });

  it('owner sees no queue and no maintenance tile', async () => {
    mocks.membership.current = OWNER;
    mocks.canWrite.current = () => false;
    mocks.overview.current = overviewWith({ checklist: null, hearings: null });
    await renderPage();
    expect(screen.queryByText('Needs attention', { selector: 'h3' })).toBeNull();
    expect(screen.queryByText('Open maintenance requests')).toBeNull();
    expect(screen.getByText('Open violations')).toBeInTheDocument();
  });

  it('greeting heading reads Welcome, {firstName}', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { level: 2, name: 'Welcome, Pat' })).toBeInTheDocument();
  });

  it('checklist failure keeps queue and agenda', async () => {
    mocks.overview.current = overviewWith({ checklist: { ok: false } });
    await renderPage();
    // Hero without readiness; the queue still lists the meeting notice rows and carries the one banner.
    expect(screen.queryByText(/checklist documents are posted/)).toBeNull();
    const queue = screen.getByRole('region', { name: 'Needs attention' });
    expect(within(queue).getByText(/couldn't load/i)).toBeInTheDocument();
    expect(screen.getAllByText(/couldn't load/i)).toHaveLength(1);
    // Rows from the sources that loaded are still listed (meeting notice for the fixture meeting).
    expect(within(queue).getByText('Post notice for Board meeting')).toBeInTheDocument();
    const agenda = screen.getByRole('region', { name: 'This week' });
    expect(within(agenda).getByText('Board meeting')).toBeInTheDocument();
  });

  it('failed meetings read never renders as "no meetings" (R11)', async () => {
    mocks.membership.current = OWNER;
    mocks.canWrite.current = () => false;
    mocks.overview.current = overviewWith({ checklist: null, hearings: null, meetings30d: { ok: false } });
    await renderPage();
    expect(screen.queryByText(/No meetings are scheduled/)).toBeNull();
    expect(screen.getByText("We couldn't load this week's schedule. Please refresh the page.")).toBeInTheDocument();
    expect(screen.queryByText('Upcoming meetings')).toBeNull();
    // Control: the other tile still renders.
    expect(screen.getByText('Open violations')).toBeInTheDocument();
  });

  it('a resident with no meetings still reads "No meetings are scheduled."', async () => {
    mocks.membership.current = OWNER;
    mocks.canWrite.current = () => false;
    mocks.overview.current = overviewWith({ checklist: null, hearings: null, meetings30d: { ok: true, value: [] } });
    await renderPage();
    expect(screen.getByText(/No meetings are scheduled/)).toBeInTheDocument();
    expect(screen.getByText('Upcoming meetings')).toBeInTheDocument();
  });

  it('essentials owner sees no violations tile', async () => {
    mocks.membership.current = { ...OWNER, subscriptionPlan: 'essentials' };
    mocks.overview.current = overviewWith({ checklist: null, hearings: null });
    await renderPage();
    expect(screen.queryByText('Open violations')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Report a problem' })).toBeNull();
  });

  it('support session hides the primary Upload button', async () => {
    const greetingRow = () =>
      screen.getByRole('heading', { level: 2, name: 'Welcome, Pat' }).parentElement!.parentElement!;
    await renderPage();
    expect(screen.getByRole('link', { name: 'Schedule meeting' })).toBeInTheDocument();
    expect(within(greetingRow()).getByRole('link', { name: 'Upload document' })).toBeInTheDocument();
    document.body.innerHTML = '';
    mocks.requestHeaders.current = new Headers({ 'x-support-session-id': '7', 'x-support-community-id': '42' });
    await renderPage();
    expect(within(greetingRow()).queryByRole('link', { name: 'Upload document' })).toBeNull();
    // Write quick actions go too; the read-only blocks still render.
    expect(screen.queryByRole('link', { name: 'Schedule meeting' })).toBeNull();
    expect(screen.getByText('Open violations')).toBeInTheDocument();
  });
});
