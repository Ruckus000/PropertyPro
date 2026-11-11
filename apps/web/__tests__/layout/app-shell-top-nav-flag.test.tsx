// @vitest-environment jsdom
/**
 * AppShell with and without the top-nav flag (D23, D29).
 *
 * The desktop rail is the default; the tabs are ON only when the variable is exactly
 * 'true'. With them on, the tab row replaces the desktop rail wrapper under the top bar
 * and the brand (tile, community name, plan) comes first in the top bar. In the default
 * build the shell renders as it did before the tabs: the rail wrapper, no brand
 * slot, and no pathname read. The mobile hamburger is the same either way.
 *
 * The flag is read inline from `process.env` at module load (so a default
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
  ShellTopNav: ({ atDesktop }: { atDesktop?: boolean }) => (
    <div data-testid="top-nav-wrapper" className={atDesktop ? 'block' : 'lg:hidden'}>
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

describe('AppShell — default build (NEXT_PUBLIC_TOP_NAV_ENABLED unset): the desktop rail', () => {
  let FlagOffAppShell: Shell;

  beforeEach(async () => {
    nav.pathname = '/dashboard';
    usePathnameSpy.mockClear();
    // Unset is the default build: next.config.ts also maps unset to 'false'.
    FlagOffAppShell = await loadShell(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('desktop sidebar present; the tab row and brand are phone-only (lg:hidden)', async () => {
    renderShell(FlagOffAppShell);

    const sidebar = screen.getByTestId('desktop-sidebar');
    expect(sidebar.parentElement).toHaveClass('hidden', 'lg:block');
    // The tab row is how a phone navigates; at lg the rail stands in for it.
    expect(await screen.findByTestId('top-nav-wrapper')).toHaveClass('lg:hidden');
    // So is the brand: the rail's own header names the community at lg.
    const brand = (await screen.findByText('Sunset Condos')).closest('div')?.parentElement;
    expect(brand).toHaveClass('lg:hidden');
  });

  it('phone with a community: no hamburger (the tabs are the way in), search collapses to an icon', async () => {
    renderShell(FlagOffAppShell);
    await screen.findByTestId('top-nav');

    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
    const search = screen.getByRole('button', { name: /^Search documents/ });
    expect(search).toHaveClass('w-11');
  });

  it('phone with no community: the hamburger and drawer stay, there is no brand', () => {
    nav.pathname = '/select-community';
    renderShell(FlagOffAppShell, { plan: null, withCommunity: false });

    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveClass('lg:hidden');
    expect(screen.getByRole('button', { name: /^Search documents/ })).not.toHaveClass('w-11');
    expect(screen.queryByText('Sunset Condos')).toBeNull();
  });

  it('phone on a PM portfolio path with no community: tabs and brand, no hamburger', async () => {
    nav.pathname = '/pm/dashboard/communities';
    renderShell(FlagOffAppShell, { plan: null, withCommunity: false });

    await screen.findByTestId('top-nav');
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
    const brand = (await screen.findByText('PropertyPro')).closest('div')?.parentElement;
    expect(brand).toHaveClass('lg:hidden');
  });

  it('topNav={true} cannot swap the rail for tabs in a default build, which never loads that slot', async () => {
    renderShell(FlagOffAppShell, { topNav: true });

    expect(screen.getByTestId('desktop-sidebar').parentElement).toHaveClass('hidden', 'lg:block');
    expect(await screen.findByTestId('top-nav-wrapper')).toHaveClass('lg:hidden');
  });
});

describe('AppShell — top tabs opt-in (NEXT_PUBLIC_TOP_NAV_ENABLED=true)', () => {
  let FlagOnAppShell: Shell;

  beforeEach(async () => {
    nav.pathname = '/dashboard';
    usePathnameSpy.mockClear();
    FlagOnAppShell = await loadShell('true');
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

  it("an explicit 'false' keeps the rail", async () => {
    const Explicit = await loadShell('false');
    renderShell(Explicit);
    expect(screen.getByTestId('desktop-sidebar')).toBeInTheDocument();
    expect(screen.queryByTestId('top-nav')).toBeNull();
  });

  it('topNav={false} keeps the rail in a flag-on build', async () => {
    renderShell(FlagOnAppShell, { topNav: false });

    expect(screen.getByTestId('desktop-sidebar').parentElement).toHaveClass('hidden', 'lg:block');
    expect(screen.queryByTestId('top-nav')).toBeNull();
    expect(screen.queryByText('Sunset Condos')).toBeNull();
  });

  it('with a community there is no hamburger: the tabs are the way in at every width', async () => {
    renderShell(FlagOnAppShell);
    await screen.findByTestId('top-nav');
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
  });

  it('top bar shows community name and plan badge', async () => {
    renderShell(FlagOnAppShell);
    const header = document.querySelector('header') as HTMLElement;
    expect(await screen.findByText('Sunset Condos')).toBeInTheDocument();
    expect(header).toHaveTextContent('Sunset Condos');
    expect(header).toHaveTextContent('Professional');
    // Desktop only: below lg the hamburger + drawer carry the brand.
    // Shown on a phone too (it names the community there); at lg it shrinks to its content.
    expect(screen.getByText('Sunset Condos').closest('div')?.parentElement).toHaveClass('lg:flex-none');
    // Search is an icon on a phone and the full field again from lg.
    expect(screen.getByRole('search')).toHaveClass('flex-none', 'lg:flex-1');
    expect(screen.getByRole('button', { name: /^Search documents/ })).toHaveClass('w-11', 'lg:w-full');
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
    // Nothing to tab through, so the phone keeps the hamburger and its drawer.
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument();
  });

  it('on a PM portfolio path with no community shows TopNav', async () => {
    nav.pathname = '/pm/dashboard/communities';
    renderShell(FlagOnAppShell, { plan: null, withCommunity: false });

    expect(await screen.findByTestId('top-nav')).toBeInTheDocument();
    expect(screen.queryByTestId('desktop-sidebar')).toBeNull();
  });
});
