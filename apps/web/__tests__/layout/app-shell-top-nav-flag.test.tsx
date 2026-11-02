// @vitest-environment jsdom
/**
 * AppShell with and without the top-nav flag (D23, D29).
 *
 * Flag off must render the shell as it always did: the desktop rail wrapper and
 * no brand slot. Flag on swaps that wrapper for the tab row under the top bar and
 * puts the brand (tile, community name, plan) first in the top bar. The mobile
 * hamburger is the same either way. `ShellTopNav` and `AppSidebar` are stubbed:
 * their own tests cover what they render; this file covers WHERE the shell mounts
 * them. `topNav` is the shell's test seam over the build-time constant.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { AppShell } from '@/components/layout/app-shell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/layout/app-sidebar', () => ({
  AppSidebar: ({ expandedOverride }: { expandedOverride?: boolean }) => (
    <div data-testid={expandedOverride ? 'drawer-sidebar' : 'desktop-sidebar'} />
  ),
}));
vi.mock('@/components/layout/top-nav-shell', () => ({
  ShellTopNav: () => (
    <div className="hidden lg:block">
      <nav aria-label="Main navigation" data-testid="top-nav" />
    </div>
  ),
}));
vi.mock('@/components/layout/profile-menu', () => ({ ProfileMenu: () => null }));
vi.mock('@/components/notifications/notification-bell', () => ({ NotificationBell: () => null }));
vi.mock('@/components/layout/shell-breadcrumbs', () => ({ ShellBreadcrumbs: () => null }));
vi.mock('@/components/help/help-widget-provider', () => ({
  HelpWidgetProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useHelpWidget: () => ({ toggle: vi.fn() }),
}));
vi.mock('@/components/help/help-widget', () => ({ HelpWidget: () => null }));
vi.mock('@/components/help/help-deep-link-handler', () => ({ HelpDeepLinkHandler: () => null }));
vi.mock('@/components/shared/page-header-help-button', () => ({ PageHeaderHelpButton: () => null }));
vi.mock('@/components/banners/free-access-banner', () => ({ FreeAccessBanner: () => null }));
vi.mock('@/components/billing/subscription-billing-banners', () => ({
  SubscriptionBillingBanners: () => null,
}));
vi.mock('@/components/demo/DemoTrialBanner', () => ({ DemoTrialBanner: () => null }));
vi.mock('@/components/command-palette', () => ({ CommandPalette: () => null }));

function renderShell(topNav: boolean, plan: string | null = 'professional') {
  return render(
    <AppShell
      topNav={topNav}
      user={{ id: 'u1', fullName: 'Pat Manager', email: 'pat@example.test' }}
      community={{ id: 7, name: 'Sunset Condos', type: 'condo_718', plan }}
      role="property_manager"
      features={getFeaturesForCommunity('condo_718')}
      resourceAccess={null}
    >
      <p>page body</p>
    </AppShell>,
  );
}

describe('AppShell — top-nav flag', () => {
  it('flag off: desktop sidebar present, no TopNav, no brand slot', () => {
    const { container } = renderShell(false);

    const sidebar = screen.getByTestId('desktop-sidebar');
    expect(sidebar.parentElement).toHaveClass('hidden', 'lg:block');
    expect(screen.queryByTestId('top-nav')).toBeNull();
    // No brand: the top bar holds only the drawer trigger, search and utilities.
    expect(screen.queryByText('Sunset Condos')).toBeNull();
    expect(container.querySelector('header > div > div.hidden.lg\\:flex')).toBeNull();
  });

  it('flag on: TopNav present, desktop sidebar absent', async () => {
    renderShell(true);

    expect(await screen.findByTestId('top-nav')).toBeInTheDocument();
    expect(screen.queryByTestId('desktop-sidebar')).toBeNull();
    // The tab row sits under the top bar, before the page content.
    const header = document.querySelector('header') as HTMLElement;
    expect(header.nextElementSibling?.contains(screen.getByTestId('top-nav'))).toBe(true);
  });

  it('flag on: mobile drawer trigger still present', () => {
    renderShell(true);
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    expect(trigger).toHaveClass('lg:hidden');
  });

  it('flag on: top bar shows community name and plan badge', () => {
    renderShell(true);
    const header = document.querySelector('header') as HTMLElement;
    expect(header).toHaveTextContent('Sunset Condos');
    expect(header).toHaveTextContent('Professional');
    // Desktop only: below lg the hamburger + drawer carry the brand.
    expect(screen.getByText('Sunset Condos').closest('div.hidden')).toHaveClass('lg:flex');
  });

  it('flag on: a community with no plan shows the name and no plan badge', () => {
    renderShell(true, null);
    const header = document.querySelector('header') as HTMLElement;
    expect(header).toHaveTextContent('Sunset Condos');
    expect(header).not.toHaveTextContent('Professional');
  });
});
