// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { format } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Rewritten for the Task 17a redesign (see
 * .superpowers/sdd/2026-09-08-admin-console-redesign/task-17a-dispatch-notes.md
 * correction #2). The previous version of this file used
 * `renderToStaticMarkup` with no `next/navigation` mock and asserted
 * case-sensitively on strings the redesign changes or moves:
 *
 *  - `toContain('Site Live')` / `'Site Not Live'` — the design's copy is
 *    `Site live` / `Site not live` (see `WorkspaceHeader`).
 *  - `'Published Mar 26, 2026'` — the new header drops the published-date
 *    caption entirely; it isn't shown anywhere in the redesigned workspace.
 *  - `renderToStaticMarkup` with no `next/navigation` mock — `ClientWorkspace`
 *    now reads `useSearchParams()` for `?tab=` handling, which throws outside
 *    a request scope. Switched to RTL + `next/navigation`/`next/link` mocks,
 *    matching this repo's other client-component test conventions (e.g.
 *    `apps/admin/__tests__/inbox/context-strip.test.tsx`).
 *
 * What's kept: site-live/not-live status still renders correctly for the
 * three billing/publish combinations that drove the original three tests —
 * just read off the new `WorkspaceHeader` badge (`Site live` / `Site not
 * live`) instead of the retired copy.
 *
 * CORRECTION (fix round 1): a prior version of this comment claimed the
 * `portal.sunsetcondo.org` / `sunset-condos.getpropertypro.com` domain
 * assertions and the `'Custom domain'` / `'Default subdomain'` copy had
 * "moved to the Website tab (`WebsiteDomainCard`, slice 17c's)". That was
 * false: no `WebsiteDomainCard` component exists anywhere in this app.
 * `OverviewTab.tsx` renders `domainInfo.displayUrl` and that exact source
 * copy directly, on the default-active tab — the assertions were simply
 * deleted, not relocated, and nothing tested that rendering. (Separately,
 * `CommunityWebsiteEditor.tsx` — the Website tab's real content, 17c's,
 * untouched here — renders the same `getWebsiteDomainInfo()` output again
 * for its own purposes; that duplication doesn't excuse dropping Overview's
 * coverage of what Overview itself renders.) Restored below.
 *
 * New coverage: the eight-tab strip in the design's order, apartments hiding
 * Compliance, exactly one `<h1>` (dispatch notes correction #1), `?tab=`
 * validation falling back to Overview on an unrecognized value, the Overview
 * website-URL detail, and that switching tabs writes the address bar via
 * `history.replaceState` rather than a router navigation.
 */
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const replaceMock = vi.fn();
let currentSearch = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

import { ClientWorkspace } from '@/components/clients/ClientWorkspace';

const baseCommunity = {
  id: 42,
  name: 'Sunset Condos',
  slug: 'sunset-condos',
  community_type: 'condo_718' as const,
  city: 'Miami',
  state: 'FL',
  zip_code: '33101',
  address_line1: '123 Ocean Dr',
  subscription_status: 'active',
  subscription_plan: 'starter',
  subscription_current_period_end_at: null,
  custom_domain: null,
  site_published_at: null,
  timezone: 'America/New_York',
  transparency_enabled: true,
  community_settings: {},
  created_at: '2026-03-20T00:00:00.000Z',
  memberCount: 12,
  documentCount: 34,
  complianceScore: 88,
  openDeletionRequest: null,
  activity: [],
};

describe('ClientWorkspace', () => {
  beforeEach(() => {
    currentSearch = '';
    replaceMock.mockClear();
  });

  it('renders the eight tabs in the design order, and exactly one h1', () => {
    render(<ClientWorkspace community={baseCommunity} />);

    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Overview',
      'Billing',
      'Members',
      'Compliance',
      'Access',
      'Website',
      'Support',
      'Settings',
    ]);
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe('Sunset Condos');
  });

  it('hides Compliance for apartments', () => {
    render(<ClientWorkspace community={{ ...baseCommunity, community_type: 'apartment' }} />);
    expect(screen.queryByRole('tab', { name: 'Compliance' })).toBeNull();
  });

  it('renders "Site live" for a published, billing-eligible community', () => {
    render(
      <ClientWorkspace
        community={{
          ...baseCommunity,
          subscription_status: 'active',
          site_published_at: '2026-03-26T12:00:00.000Z',
          custom_domain: 'portal.sunsetcondo.org',
        }}
      />,
    );

    expect(screen.getByText('Site live')).toBeTruthy();
  });

  it('renders "Site not live" when unpublished', () => {
    render(
      <ClientWorkspace
        community={{ ...baseCommunity, subscription_status: 'active', site_published_at: null, custom_domain: null }}
      />,
    );

    expect(screen.getByText('Site not live')).toBeTruthy();
  });

  it('renders "Site not live" when billing is ineligible even though the site is published', () => {
    render(
      <ClientWorkspace
        community={{
          ...baseCommunity,
          subscription_status: 'past_due',
          site_published_at: '2026-03-26T12:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByText('Site not live')).toBeTruthy();
  });

  it('shows the past-due AlertBanner on Overview, with the current-period-end date', () => {
    render(
      <ClientWorkspace
        community={{
          ...baseCommunity,
          subscription_status: 'past_due',
          subscription_current_period_end_at: '2026-04-01T00:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByText('Subscription is past due')).toBeTruthy();
    // Don't hardcode the formatted day — `format()` renders in the host's
    // local timezone, so a UTC-midnight instant can print as the previous
    // calendar day depending on where the test runs (verified: prints "Mar
    // 31, 2026" here, not "Apr 1"). Compute it the same way the component
    // does rather than asserting a specific date string.
    const expectedDate = format(new Date('2026-04-01T00:00:00.000Z'), 'MMM d, yyyy');
    expect(screen.getByText(new RegExp(`ended ${expectedDate}`))).toBeTruthy();
  });

  it('does not show the past-due AlertBanner for an active subscription', () => {
    render(<ClientWorkspace community={{ ...baseCommunity, subscription_status: 'active' }} />);
    expect(screen.queryByText('Subscription is past due')).toBeNull();
  });

  it('opens on the tab named by a valid ?tab= value', () => {
    // 'billing' rather than a data-fetching tab (e.g. Members) — that panel is
    // a static stub, so this stays a pure render test of the ?tab= reader
    // rather than also exercising CommunityMembers' fetch-on-mount.
    currentSearch = 'tab=billing';
    render(<ClientWorkspace community={baseCommunity} />);
    expect(screen.getByRole('tab', { name: 'Billing' }).getAttribute('aria-selected')).toBe('true');
  });

  it('falls back to Overview for an unrecognized ?tab= value rather than trusting it', () => {
    currentSearch = 'tab=not-a-real-tab';
    render(<ClientWorkspace community={baseCommunity} />);
    expect(screen.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected')).toBe('true');
  });

  it('renders the website URL and source label on the default-active Overview tab, for a custom domain', () => {
    render(<ClientWorkspace community={{ ...baseCommunity, custom_domain: 'portal.sunsetcondo.org' }} />);

    expect(screen.getByText('portal.sunsetcondo.org')).toBeTruthy();
    expect(screen.getByText('Custom domain')).toBeTruthy();
    expect(screen.queryByText('Default subdomain')).toBeNull();
  });

  it('renders the slug-fallback website URL and source label when there is no custom domain', () => {
    render(<ClientWorkspace community={{ ...baseCommunity, custom_domain: null }} />);

    expect(screen.getByText('sunset-condos.getpropertypro.com')).toBeTruthy();
    expect(screen.getByText('Default subdomain')).toBeTruthy();
    expect(screen.queryByText('Custom domain')).toBeNull();
  });

  it('switches tabs by writing history.replaceState directly, without a router navigation', () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
    render(<ClientWorkspace community={baseCommunity} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Billing' }));

    // The route this component lives on is `dynamic = 'force-dynamic'`, so a
    // `router.replace()` call here would re-run the auth gate and the
    // page's five data-fetching queries on every tab click. The tab is
    // client state — only the address bar needs updating, via the
    // platform history API, not the Next.js router.
    expect(replaceMock).not.toHaveBeenCalled();
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', expect.stringContaining('tab=billing'));
    expect(screen.getByRole('tab', { name: 'Billing' }).getAttribute('aria-selected')).toBe('true');

    replaceStateSpy.mockRestore();
  });
});
