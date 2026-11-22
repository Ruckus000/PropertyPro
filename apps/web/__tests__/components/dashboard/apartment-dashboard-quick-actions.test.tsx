/**
 * The apartment dashboard's Quick Actions must reach the page each one names.
 *
 * "Add Tenant" linked to /tenants/invite, a route that was never built (a 404).
 * "New Maintenance Request" linked to /maintenance/new, which the legacy
 * /maintenance/[id] shim read as a request id and sent to the request list with
 * no form open.
 *
 * Every href is resolved against the real app/ directory, so a link to a page
 * that does not exist fails here. That check cannot see the second kind of
 * mistake, a path a dynamic segment swallows, so each action's exact href is
 * pinned as well.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApartmentMetrics } from '@/lib/queries/apartment-metrics';

vi.mock('@/components/dashboard/apartment-metrics', () => ({
  ApartmentMetricsCards: () => null,
}));
vi.mock('@/components/dashboard/dashboard-announcements', () => ({
  DashboardAnnouncements: () => null,
}));

import { ApartmentDashboard } from '@/components/dashboard/apartment-dashboard';

const APP_DIR = path.resolve(__dirname, '../../../src/app');

/** Every page route under app/, with route groups removed: ["dashboard", "directory"]. */
function collectPageRoutes(dir: string, segments: string[] = []): string[][] {
  const routes: string[][] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /^page\.(tsx|ts|jsx|js)$/.test(entry.name)) routes.push(segments);
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name === '__tests__') continue;
    const isGroup = /^\(.*\)$/.test(entry.name);
    routes.push(...collectPageRoutes(path.join(dir, entry.name), isGroup ? segments : [...segments, entry.name]));
  }
  return routes;
}

const PAGE_ROUTES = collectPageRoutes(APP_DIR);

function routeExists(pathname: string): boolean {
  const wanted = pathname.split('/').filter(Boolean);
  return PAGE_ROUTES.some(
    (route) =>
      route.length === wanted.length &&
      route.every((segment, i) => /^\[[^.]+\]$/.test(segment) || segment === wanted[i]),
  );
}

const METRICS = { announcements: [] } as unknown as ApartmentMetrics;

function quickActionLinks(props: { canWriteAnnouncements: boolean; canManageResidents: boolean }) {
  render(<ApartmentDashboard metrics={METRICS} communityId={7} {...props} />);
  const section = screen.getByRole('heading', { name: 'Quick Actions' }).closest('section');
  if (!section) throw new Error('Quick Actions section not rendered');
  return within(section).getAllByRole('link');
}

describe('apartment dashboard quick actions', () => {
  it('found the app routes it checks against', () => {
    // A scan that found nothing would let every href "exist" by accident.
    expect(PAGE_ROUTES.length).toBeGreaterThan(50);
    expect(routeExists('/dashboard/apartment')).toBe(true);
    expect(routeExists('/tenants/invite')).toBe(false);
  });

  it('links every action, for a manager, to a page that exists', () => {
    const links = quickActionLinks({ canWriteAnnouncements: true, canManageResidents: true });

    expect(links.map((a) => a.textContent)).toEqual([
      'Add Tenant',
      'Post Announcement',
      'New Maintenance Request',
    ]);
    for (const link of links) {
      const url = new URL(link.getAttribute('href') ?? '', 'https://x.test');
      expect(routeExists(url.pathname), `${link.textContent} → ${url.pathname}`).toBe(true);
      // The community rides in the query or in the path; either way it is this one.
      const scoped = url.searchParams.get('communityId') === '7' || url.pathname.startsWith('/communities/7/');
      expect(scoped, `${link.textContent} is not scoped to community 7`).toBe(true);
    }
  });

  it('sends Add Tenant to the Directory residents tab', () => {
    const [addTenant] = quickActionLinks({ canWriteAnnouncements: true, canManageResidents: true });
    expect(addTenant).toHaveAttribute('href', '/dashboard/directory?communityId=7&tab=residents');
  });

  it('opens the new-request sheet in Operations directly, not through the legacy redirect', () => {
    const links = quickActionLinks({ canWriteAnnouncements: false, canManageResidents: false });
    const request = links.find((a) => a.textContent === 'New Maintenance Request');
    expect(request).toHaveAttribute('href', '/communities/7/operations?tab=requests&create=request');
  });

  it('keeps the 44px touch floor below md on every action', () => {
    for (const link of quickActionLinks({ canWriteAnnouncements: true, canManageResidents: true })) {
      expect(link.className).toMatch(/(^|\s)min-h-11(\s|$)/);
      expect(link.className).toMatch(/(^|\s)md:min-h-0(\s|$)/);
    }
  });

  it('hides Add Tenant from someone who cannot add residents', () => {
    const links = quickActionLinks({ canWriteAnnouncements: false, canManageResidents: false });
    expect(links.map((a) => a.textContent)).toEqual(['New Maintenance Request']);
  });
});
