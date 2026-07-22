import React, { type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEffectiveFeatures, type CommunityRole } from '@propertypro/shared';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SidebarProvider } from '@/components/layout/sidebar-context';

/**
 * The lapse rule is split across two places on purpose, and this file guards
 * the join:
 *
 *   - `nav-config` hides everything but the dashboard when told the viewer is a
 *     lapsed ADMIN (covered by nav-config-slim.test.ts)
 *   - `app-sidebar` decides who counts as one — `isLapsed && isAdminRole(role)`
 *
 * Getting the second half wrong is silent in both directions: too broad and a
 * resident loses a nav they are still entitled to; too narrow and the sidebar
 * advertises surfaces `requireEntitledForAdminRead` returns 403 for. The
 * original bug in this feature was exactly the latter, and the unit suite was
 * green while it shipped — because nothing tested the combination.
 */

let mockPathname = '/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/layout/community-picker-dialog', () => ({
  CommunityPickerDialog: () => null,
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <SidebarProvider>{node}</SidebarProvider>
    </QueryClientProvider>
  );
}

function renderSidebar(role: CommunityRole, isLapsed: boolean, isUnitOwner = true) {
  return render(
    wrap(
      <AppSidebar
        communityId={7}
        communityName="Sunset Condos"
        communityType="condo_718"
        role={role}
        isUnitOwner={isUnitOwner}
        // Cancellation nulls the plan, so this is the real shape of a lapsed
        // community's feature set — not a professional one.
        features={getEffectiveFeatures('condo_718', null)}
        isLapsed={isLapsed}
        userName="Test Ruckus"
        plan={null}
        expandedOverride
        showCollapseToggle={false}
      />,
    ),
  );
}

beforeEach(() => {
  mockPathname = '/dashboard';
  window.localStorage.clear();
});

describe('AppSidebar — lapsed community', () => {
  it('collapses a manager’s nav to the dashboard', async () => {
    renderSidebar('property_manager', true);

    expect(await screen.findByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    for (const label of [/documents/i, /meetings/i, /violations/i]) {
      expect(screen.queryByRole('link', { name: label })).toBeNull();
    }
  });

  it('treats root_manager the same as property_manager', async () => {
    renderSidebar('root_manager', true);

    expect(await screen.findByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /documents/i })).toBeNull();
  });

  it('leaves a resident’s nav untouched — they are never gated', async () => {
    // requireEntitledForAdminRead short-circuits on `!membership.isAdmin`, so a
    // resident keeps full read access on a lapsed community. This is how an
    // association retains access to its own records; blocking them here would
    // both contradict the API and be the more damaging half of getting the
    // rule wrong.
    renderSidebar('resident', true);

    expect(await screen.findByRole('link', { name: /documents/i })).toBeInTheDocument();
  });

  it('does not gate a board president, whose designation is not an admin role', async () => {
    // ADMIN_TIER_DB_ROLES is property_manager/root_manager only. Board status
    // is an orthogonal `designation` column (ADR-006) and deliberately does not
    // grant admin, so a board president is a resident for this purpose.
    renderSidebar('resident', true);

    expect(await screen.findByRole('link', { name: /meetings/i })).toBeInTheDocument();
  });

  it('leaves a non-lapsed manager untouched', async () => {
    renderSidebar('property_manager', false);

    expect(await screen.findByRole('link', { name: /documents/i })).toBeInTheDocument();
  });
});
