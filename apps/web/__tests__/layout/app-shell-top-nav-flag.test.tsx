// @vitest-environment jsdom
/**
 * AppShell with and without the top-nav flag (D23, D29).
 *
 * The tabs are ON unless the variable is exactly 'false' (the kill switch). With
 * them on, the tab row replaces the desktop rail wrapper under the top bar and the
 * brand (tile, community name, plan) comes first in the top bar. With the kill
 * switch the shell renders as it did before the tabs: the rail wrapper, no brand
 * slot, and no pathname read. The mobile hamburger is the same either way.
 *
 * The flag is read inline from `process.env` at module load (so a kill-switched
 * build drops the tab row's imports), so each case stubs the variable and imports
 * a fresh copy of the shell. `ShellTopNav` and `AppSidebar` are stubbed: their own
 * tests cover what they render; this file covers WHERE the shell mounts them.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getFeaturesForCommunity } from '@propertypro/shared';

const nav = vi.hoisted(() => ({ pathname: '/dashboard' }));
const usePathnameSpy = vi.hoisted(() => vi.fn(() => nav.pathname));
vi.mock('next/navigation', () => ({
  usePathname: usePathnameSpy,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/layout/app-sidebar', () => ({
  AppSidebar: ({ expandedOverride }: { expandedOverride?: boolean }) => (
    <div data-testid={expandedOverride ? 'drawer-sidebar' : 'desktop-sidebar'} />
  ),
}));
// Only the tab row is stubbed; the brand and rail slots (top-nav-slots.tsx, which
// own the pathname reads) are real.
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

type Shell = typeof import('@/components/layout/app-shell').AppShell;

/** A fresh copy of the shell, loaded with the variable set to `value` (undefined = unset). */
async function loadShell(value: string | undefined): Promise<Shell> {
  vi.stubEnv('NEXT_PUBLIC_TOP_NAV_ENABLED', value);
  vi.resetModules();
  return (await import('@/components/layout/app-shell')).AppShell;
}

function renderShell(
  Shell: Shell,
  { plan = 'professional', withCommunity = true, topNav }: { plan?: string | null; withCommunity?: boolean; topNav?: boolean } = {},
) {
  return render(
    <Shell
      topNav={topNav}
      user={{ id: 'u1', fullName: 'Pat Manager', email: 'pat@example.test' }}
      community={withCommunity ? { id: 7, name: 'Sunset Condos', type: 'condo_718', plan } : null}
      role={withCommunity ? 'property_manager' : null}
      features={withCommunity ? getFeaturesForCommunity('condo_718') : null}
      resourceAccess={null}
    >
      <p>page body</p>
    </Shell>,
  );
}

describe('AppShell — kill switch (NEXT_PUBLIC_TOP_NAV_ENABLED=false)', () => {
  let FlagOffAppShell: Shell;

  beforeEach(async () => {
    nav.pathname = '/dashboard';
    usePathnameSpy.mockClear();
    FlagOffAppShell = await loadShell('false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('desktop sidebar present, no TopNav, no brand slot', () => {
    const { container } = renderShell(FlagOffAppShell);

    const sidebar = screen.getByTestId('desktop-sidebar');
    expect(sidebar.parentElement).toHaveClass('hidden', 'lg:block');
    expect(screen.queryByTestId('top-nav')).toBeNull();
    // No brand: the top bar holds only the drawer trigger, search and utilities.
    expect(screen.queryByText('Sunset Condos')).toBeNull();
    expect(container.querySelector('header > div > div.hidden.lg\\:flex')).toBeNull();
  });

  it('reads no pathname: a flag-off shell calls no navigation hook (re-render per navigation)', () => {
    renderShell(FlagOffAppShell);
    renderShell(FlagOffAppShell, { withCommunity: false });

    expect(usePathnameSpy).not.toHaveBeenCalled();
  });

  it('topNav={true} cannot mount tabs in a kill-switched build, which never loads them', () => {
    renderShell(FlagOffAppShell, { topNav: true });

    expect(screen.getByTestId('desktop-sidebar').parentElement).toHaveClass('hidden', 'lg:block');
    expect(screen.queryByTestId('top-nav')).toBeNull();
    expect(usePathnameSpy).not.toHaveBeenCalled();
  });
});

describe('AppShell — top tabs on (the default)', () => {
  let FlagOnAppShell: Shell;

  beforeEach(async () => {
    nav.pathname = '/dashboard';
    usePathnameSpy.mockClear();
    // Unset is the default build: next.config.ts also maps unset to 'true'.
    FlagOnAppShell = await loadShell(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('TopNav present, desktop sidebar absent', async () => {
    renderShell(FlagOnAppShell);

    expect(await screen.findByTestId('top-nav')).toBeInTheDocument();
    expect(screen.queryByTestId('desktop-sidebar')).toBeNull();
    // The tab row sits under the top bar, before the page content.
    const header = document.querySelector('header') as HTMLElement;
    expect(header.nextElementSibling?.contains(screen.getByTestId('top-nav'))).toBe(true);
  });

  it("an explicit 'true' also turns the tabs on", async () => {
    const Explicit = await loadShell('true');
    renderShell(Explicit);
    expect(await screen.findByTestId('top-nav')).toBeInTheDocument();
    expect(screen.queryByTestId('desktop-sidebar')).toBeNull();
  });

  it('topNav={false} keeps the rail in a flag-on build', async () => {
    renderShell(FlagOnAppShell, { topNav: false });

    expect(screen.getByTestId('desktop-sidebar').parentElement).toHaveClass('hidden', 'lg:block');
    expect(screen.queryByTestId('top-nav')).toBeNull();
    expect(screen.queryByText('Sunset Condos')).toBeNull();
  });

  it('mobile drawer trigger still present', () => {
    renderShell(FlagOnAppShell);
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    expect(trigger).toHaveClass('lg:hidden');
  });

  it('top bar shows community name and plan badge', async () => {
    renderShell(FlagOnAppShell);
    const header = document.querySelector('header') as HTMLElement;
    expect(await screen.findByText('Sunset Condos')).toBeInTheDocument();
    expect(header).toHaveTextContent('Sunset Condos');
    expect(header).toHaveTextContent('Professional');
    // Desktop only: below lg the hamburger + drawer carry the brand.
    expect(screen.getByText('Sunset Condos').closest('div.hidden')).toHaveClass('lg:flex');
  });

  it('a community with no plan shows the name and no plan badge', async () => {
    renderShell(FlagOnAppShell, { plan: null });
    const header = document.querySelector('header') as HTMLElement;
    expect(await screen.findByText('Sunset Condos')).toBeInTheDocument();
    expect(header).toHaveTextContent('Sunset Condos');
    expect(header).not.toHaveTextContent('Professional');
  });

  it('with no community falls back to the desktop sidebar', async () => {
    nav.pathname = '/select-community';
    renderShell(FlagOnAppShell, { plan: null, withCommunity: false });

    // No community means an empty tab model and an lg:hidden hamburger; the rail
    // (with its community picker) is the only navigation left at lg and up.
    // (The tab row itself renders nothing with no tabs: top-nav-shell.test.tsx.)
    const sidebar = await screen.findByTestId('desktop-sidebar');
    expect(sidebar.parentElement).toHaveClass('hidden', 'lg:block');
    const header = document.querySelector('header') as HTMLElement;
    expect(header).not.toHaveTextContent('PropertyPro');
  });

  it('on a PM portfolio path with no community shows TopNav', async () => {
    nav.pathname = '/pm/dashboard/communities';
    renderShell(FlagOnAppShell, { plan: null, withCommunity: false });

    expect(await screen.findByTestId('top-nav')).toBeInTheDocument();
    expect(screen.queryByTestId('desktop-sidebar')).toBeNull();
  });
});
