// @vitest-environment jsdom
/**
 * ShellTopNav — what the shell hands the pure model and the tab row.
 *
 * `useNavBadges` is mocked so the test controls the counts and can read the
 * arguments the shell derived (isPmContext, lapsedAdmin); `TopNav` is replaced
 * by a probe that records its props.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { ShellTopNav, type ShellTopNavProps } from '@/components/layout/top-nav-shell';
import type { TopNavLink, TopNavModel } from '@/components/layout/top-nav-model';

const state = vi.hoisted(() => ({
  pathname: '/dashboard',
  search: '',
  badgeArgs: null as Record<string, unknown> | null,
  topNavProps: null as { model: TopNavModel; upgrade: Record<string, unknown> } | null,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock('@/components/layout/use-nav-badges', () => ({
  useNavBadges: (args: Record<string, unknown>) => {
    state.badgeArgs = args;
    return { pendingJoinRequests: 3, missingRecords: 2 };
  },
}));
vi.mock('@/components/layout/top-nav', () => ({
  TopNav: (props: { model: TopNavModel; upgrade: Record<string, unknown> }) => {
    state.topNavProps = props;
    return <nav aria-label="Main navigation" />;
  },
}));

const BASE: ShellTopNavProps = {
  communityId: 7,
  communityType: 'condo_718',
  role: 'property_manager',
  isUnitOwner: false,
  features: getFeaturesForCommunity('condo_718'),
  isLapsed: false,
  plan: 'professional',
};

function allLinks(model: TopNavModel): TopNavLink[] {
  return [...model.tabs, ...model.moreGroups.flatMap((g) => g.links)];
}

describe('ShellTopNav', () => {
  beforeEach(() => {
    state.pathname = '/dashboard';
    state.search = '';
    state.badgeArgs = null;
    state.topNavProps = null;
  });

  it('passes community context and the resolved plan to the badges and the tab row', () => {
    const { container } = render(<ShellTopNav {...BASE} />);

    expect(state.badgeArgs).toMatchObject({
      communityId: 7,
      role: 'property_manager',
      communityType: 'condo_718',
      isPmContext: false,
      lapsedAdmin: false,
    });
    expect(state.topNavProps?.upgrade).toMatchObject({
      currentPlanId: 'professional',
      currentPlanRaw: 'professional',
      role: 'property_manager',
      communityType: 'condo_718',
      isUnitOwner: false,
    });
    // One wrapper, and its rule is TopNav's own: no second border-b here.
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toHaveClass('lg:hidden');
    expect(wrapper.className).not.toContain('border-b');
  });

  it('atDesktop shows the row at lg and up too (the flag swapped the rail for it)', () => {
    const { container } = render(<ShellTopNav {...BASE} atDesktop />);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).not.toHaveClass('lg:hidden');
  });

  it('badge counts reach the model links', () => {
    render(<ShellTopNav {...BASE} />);
    const links = allLinks(state.topNavProps!.model);
    expect(links.find((l) => l.id === 'directory')?.badge).toBe(3);
    expect(links.find((l) => l.id === 'website')?.badge).toBe(2);
  });

  it('lapsedAdmin is true only for an admin on a lapsed community', () => {
    render(<ShellTopNav {...BASE} isLapsed />);
    expect(state.badgeArgs).toMatchObject({ lapsedAdmin: true });

    render(<ShellTopNav {...BASE} isLapsed role="resident" isUnitOwner />);
    expect(state.badgeArgs).toMatchObject({ lapsedAdmin: false });
  });

  it('renders nothing on a PM portfolio path: those pages have no tab row', () => {
    state.pathname = '/pm/dashboard/communities';
    const { container } = render(
      <ShellTopNav {...BASE} communityId={null} communityType={null} role={null} features={null} plan={null} />,
    );

    expect(state.badgeArgs).toMatchObject({ isPmContext: true, communityId: null });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when no tab can be built', () => {
    state.pathname = '/select-community';
    const { container } = render(
      <ShellTopNav {...BASE} communityId={null} communityType={null} role={null} features={null} plan={null} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
