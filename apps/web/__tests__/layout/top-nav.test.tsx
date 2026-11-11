// @vitest-environment jsdom
/**
 * TopNav / TopNavMoreMenu — rendering of the pure `TopNavModel`.
 *
 * `UpgradeDialog` is stubbed: its own tests cover the dialog, and what matters
 * here is that a locked link opens it with the rail's props instead of
 * navigating.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'vitest-axe';
import { TopNav } from '@/components/layout/top-nav';
import type { TopNavLink, TopNavModel } from '@/components/layout/top-nav-model';

const dialogProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));
vi.mock('@/components/billing/upgrade-dialog', () => ({
  UpgradeDialog: (props: Record<string, unknown>) => {
    dialogProps.last = props;
    return props.open ? <div role="dialog" aria-label="Upgrade stub" /> : null;
  },
}));

const prefetchNavData = vi.hoisted(() => vi.fn());
vi.mock('@/components/layout/nav-prefetch', () => ({ prefetchNavData }));

function link(id: string, overrides: Partial<TopNavLink> = {}): TopNavLink {
  return {
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    href: `/${id}?communityId=7`,
    active: false,
    badge: null,
    planLocked: false,
    upgradePlanName: null,
    upgradePlanId: null,
    upgradeFeatureKey: null,
    ...overrides,
  };
}

function model(overrides: Partial<TopNavModel> = {}): TopNavModel {
  return {
    tabs: [link('dashboard', { active: true }), link('meetings')],
    moreGroups: [
      { label: 'Community', links: [link('directory'), link('forum')] },
      { label: 'Finance', links: [link('payments')] },
    ],
    moreHasActive: false,
    moreHasBadge: false,
    ...overrides,
  };
}

const UPGRADE = {
  currentPlanId: 'essentials' as const,
  currentPlanRaw: 'essentials',
  role: 'resident' as const,
  communityType: 'hoa_720' as const,
  isUnitOwner: true,
};

const queryClient = new QueryClient();

function renderNav(m: TopNavModel) {
  return render(
    <QueryClientProvider client={queryClient}>
      <TopNav model={m} communityId={7} upgrade={UPGRADE} />
    </QueryClientProvider>,
  );
}

describe('TopNav', () => {
  it('active tab has aria-current=page', () => {
    renderNav(model());
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const active = within(nav).getByRole('link', { name: 'Dashboard' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active.className).toContain('border-interactive');
    const other = within(nav).getByRole('link', { name: 'Meetings' });
    expect(other).not.toHaveAttribute('aria-current');
    expect(other.className).toContain('border-transparent');
    expect(within(nav).queryByRole('tab')).toBeNull();
  });

  it('renders nothing for an empty model', () => {
    const { container } = renderNav(model({ tabs: [], moreGroups: [] }));
    expect(container).toBeEmptyDOMElement();
  });

  it('More opens on click and closes on Escape with focus restored', async () => {
    const user = userEvent.setup();
    renderNav(model());
    const more = screen.getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveAttribute('aria-haspopup', 'dialog');
    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const panel = await screen.findByRole('dialog', { name: 'More pages' });
    // Capped to the viewport minus a gutter: w-screen pushed the page sideways on a 375px phone.
    expect(panel).toHaveClass('w-[calc(100vw-2rem)]', 'max-w-xl');
    expect(within(panel).getByText('Community')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Payments' })).toBeInTheDocument();
    expect(within(panel).getByText("Can't find it? Search every page and record.")).toBeInTheDocument();
    expect(within(panel).getByText('⌘K')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'More pages' })).toBeNull();
    expect(more).toHaveFocus();
  });

  it('choosing a More link closes the panel', async () => {
    const user = userEvent.setup();
    renderNav(model());
    await user.click(screen.getByRole('button', { name: 'More' }));
    const panel = await screen.findByRole('dialog', { name: 'More pages' });
    await user.click(within(panel).getByRole('link', { name: 'Forum' }));
    expect(screen.queryByRole('dialog', { name: 'More pages' })).toBeNull();
  });

  it('More is absent with no groups', () => {
    renderNav(model({ moreGroups: [] }));
    expect(screen.queryByRole('button', { name: /more/i })).toBeNull();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('More carries the active underline when a More item is active', () => {
    renderNav(model({ moreHasActive: true }));
    expect(screen.getByRole('button', { name: 'More' }).className).toContain('border-interactive');
  });

  it('locked item opens UpgradeDialog without navigating', async () => {
    const user = userEvent.setup();
    renderNav(
      model({
        tabs: [
          link('dashboard', { active: true }),
          link('reports', {
            planLocked: true,
            upgradePlanId: 'professional',
            upgradeFeatureKey: 'hasCompliance' as never,
          }),
        ],
        moreGroups: [],
      }),
    );
    expect(screen.queryByRole('link', { name: /Reports/ })).toBeNull();
    const locked = screen.getByRole('button', { name: /Reports/ });
    expect(within(locked).getByText('Pro')).toBeInTheDocument();
    await user.click(locked);
    expect(screen.getByRole('dialog', { name: 'Upgrade stub' })).toBeInTheDocument();
    expect(dialogProps.last).toMatchObject({
      open: true,
      featureKey: 'hasCompliance',
      upgradePlanId: 'professional',
      currentPlanId: 'essentials',
      currentPlanRaw: 'essentials',
      role: 'resident',
      communityType: 'hoa_720',
      isUnitOwner: true,
      communityId: 7,
    });
  });

  it('a locked item inside More opens UpgradeDialog and closes the panel', async () => {
    const user = userEvent.setup();
    renderNav(
      model({
        moreGroups: [
          { label: 'Finance', links: [link('payments', { planLocked: true, upgradePlanId: 'professional' })] },
        ],
      }),
    );
    await user.click(screen.getByRole('button', { name: 'More' }));
    const panel = await screen.findByRole('dialog', { name: 'More pages' });
    await user.click(within(panel).getByRole('button', { name: /Payments/ }));
    expect(screen.queryByRole('dialog', { name: 'More pages' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Upgrade stub' })).toBeInTheDocument();
  });

  it('locked tabs and locked More items announce the dialog they open, as the rail does', async () => {
    const user = userEvent.setup();
    renderNav(
      model({
        tabs: [link('dashboard', { active: true }), link('reports', { planLocked: true })],
        moreGroups: [{ label: 'Finance', links: [link('payments', { planLocked: true }), link('ledger')] }],
      }),
    );
    expect(screen.getByRole('button', { name: /Reports/ })).toHaveAttribute('aria-haspopup', 'dialog');
    // Unlocked tabs are plain links, with no popup.
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-haspopup');
    await user.click(screen.getByRole('button', { name: 'More' }));
    const panel = await screen.findByRole('dialog', { name: 'More pages' });
    expect(within(panel).getByRole('button', { name: /Payments/ })).toHaveAttribute('aria-haspopup', 'dialog');
    expect(within(panel).getByRole('link', { name: 'Ledger' })).not.toHaveAttribute('aria-haspopup');
  });

  it('badge dot has an accessible label', () => {
    renderNav(model({ moreHasBadge: true }));
    const more = screen.getByRole('button', { name: /More/ });
    expect(within(more).getByText('has updates')).toHaveClass('sr-only');
  });

  it('no dot when More has no badge', () => {
    renderNav(model());
    expect(screen.queryByText('has updates')).toBeNull();
  });

  it('tab badge reads as a count plus its meaning', () => {
    renderNav(
      model({
        tabs: [link('directory', { badge: 3 }), link('website', { badge: 1 })],
      }),
    );
    expect(screen.getByRole('link', { name: /Directory/ })).toHaveTextContent('3');
    expect(screen.getByText('3 pending join requests')).toHaveClass('sr-only');
    expect(screen.getByText('1 missing record')).toHaveClass('sr-only');
  });

  it('axe with More open → no violations', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderNav(
      model({
        tabs: [link('dashboard', { active: true }), link('directory', { badge: 2 }), link('reports', { planLocked: true })],
        moreHasBadge: true,
        moreHasActive: true,
        moreGroups: [
          { label: 'Community', links: [link('forum', { active: true }), link('payments', { badge: 4 })] },
          { label: 'Finance', links: [link('ledger', { planLocked: true })] },
        ],
      }),
    );
    await user.click(screen.getByRole('button', { name: /More/ }));
    expect(await screen.findByRole('dialog', { name: 'More pages' })).toBeInTheDocument();
    const results = await axe(baseElement);
    expect(results).toHaveNoViolations();
  });
  it('tab and More links warm their data on hover and focus, as the rail does', async () => {
    prefetchNavData.mockClear();
    const user = userEvent.setup();
    renderNav(model());
    const meetings = screen.getByRole('link', { name: 'Meetings' });
    fireEvent.pointerEnter(meetings);
    expect(prefetchNavData).toHaveBeenLastCalledWith(queryClient, '/meetings?communityId=7', 7);
    fireEvent.focus(screen.getByRole('link', { name: 'Dashboard' }));
    expect(prefetchNavData).toHaveBeenLastCalledWith(queryClient, '/dashboard?communityId=7', 7);
    await user.click(screen.getByRole('button', { name: 'More' }));
    const panel = await screen.findByRole('dialog', { name: 'More pages' });
    fireEvent.pointerEnter(within(panel).getByRole('link', { name: 'Payments' }));
    expect(prefetchNavData).toHaveBeenLastCalledWith(queryClient, '/payments?communityId=7', 7);
  });

  it('a locked tab warms nothing (it opens a dialog, not a page)', () => {
    prefetchNavData.mockClear();
    renderNav(model({ tabs: [link('dashboard', { active: true }), link('reports', { planLocked: true })] }));
    fireEvent.pointerEnter(screen.getByRole('button', { name: /Reports/ }));
    expect(prefetchNavData).not.toHaveBeenCalled();
  });

  it('More names the current page for a screen reader when it lives inside More', () => {
    renderNav(
      model({
        tabs: [link('dashboard'), link('meetings')],
        moreHasActive: true,
        moreGroups: [{ label: 'Community', links: [link('directory'), link('forum', { active: true })] }],
      }),
    );
    const more = screen.getByRole('button', { name: 'More, current page: Forum' });
    expect(within(more).getByText(', current page: Forum')).toHaveClass('sr-only');
  });

  it('no current-page hint on More when the active page is a tab', () => {
    renderNav(model());
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
    expect(screen.queryByText(/current page/)).toBeNull();
  });
  it("More's aria-controls names the panel it opens (a fixed id, stable across server and client)", async () => {
    const user = userEvent.setup();
    renderNav(model());
    const more = screen.getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-controls', 'top-nav-more-panel');
    await user.click(more);
    const panel = await screen.findByRole('dialog', { name: 'More pages' });
    expect(panel).toHaveAttribute('id', 'top-nav-more-panel');
  });
});
