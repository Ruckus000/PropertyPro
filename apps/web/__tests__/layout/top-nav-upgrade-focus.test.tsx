// @vitest-environment jsdom
/**
 * Where keyboard focus lands when the upgrade dialog closes.
 *
 * Uses the REAL `UpgradeDialog` (top-nav.test.tsx stubs it), because the defect
 * is in how Radix restores focus: the More item that opened the dialog unmounts
 * with its panel, so without a hand-off focus falls to <body>.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TopNav } from '@/components/layout/top-nav';
import type { TopNavLink, TopNavModel } from '@/components/layout/top-nav-model';

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

const MODEL: TopNavModel = {
  tabs: [
    link('dashboard', { active: true }),
    link('reports', { planLocked: true, upgradePlanId: 'professional', upgradeFeatureKey: 'hasViolations' }),
  ],
  moreGroups: [
    {
      label: 'Finance',
      links: [link('payments', { planLocked: true, upgradePlanId: 'professional', upgradeFeatureKey: 'hasViolations' })],
    },
  ],
  moreHasActive: false,
  moreHasBadge: false,
};

function renderNav() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TopNav
        model={MODEL}
        communityId={7}
        upgrade={{
          currentPlanId: 'essentials',
          currentPlanRaw: 'essentials',
          role: 'property_manager',
          communityType: 'hoa_720',
        }}
      />
    </QueryClientProvider>,
  );
}

describe('TopNav upgrade dialog focus', () => {
  it('returns focus to More when the dialog was opened from a More item', async () => {
    const user = userEvent.setup();
    renderNav();
    const more = screen.getByRole('button', { name: 'More' });
    await user.click(more);
    const panel = await screen.findByRole('dialog', { name: 'More pages' });
    await user.click(within(panel).getByRole('button', { name: /Payments/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(more).toHaveFocus());
  });

  it('returns focus to the locked tab that opened it', async () => {
    const user = userEvent.setup();
    renderNav();
    const reports = screen.getByRole('button', { name: /Reports/ });
    await user.click(reports);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(reports).toHaveFocus());
  });
});
