/**
 * D11 (2026-11-20 resident review): Cmd-K and mobile search must show Payments
 * to a unit owner. Both called `useFilteredRegistry` without `isUnitOwner`, so
 * the `owner_or_admin` gate failed closed and owners lost Payments while the
 * sidebar showed it. The fix plumbs `isUnitOwner` through; tenants stay hidden.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CommunityFeatures } from '@propertypro/shared';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

// The server data search is not under test; keep it inert.
vi.mock('@/hooks/use-data-search', () => ({
  useDataSearch: () => ({ groups: [], search: vi.fn(), reset: vi.fn(), isSearching: false }),
}));

// No recent pages: mobile search then renders its "getting started" list,
// which leads with Payments for residents.
vi.mock('@/hooks/use-recent-pages', () => ({
  useRecentPages: () => ({ recentPages: [], addPage: vi.fn() }),
}));

import { CommandPalette } from '@/components/command-palette/CommandPalette';
import { MobileSearchContent } from '@/components/mobile/MobileSearchContent';

const FINANCE_ON = { hasFinance: true } as unknown as CommunityFeatures;

function renderPalette(isUnitOwner: boolean) {
  render(
    <CommandPalette
      open
      onOpenChange={() => {}}
      communityId={42}
      role="resident"
      isUnitOwner={isUnitOwner}
      features={FINANCE_ON}
      resourceAccess={null}
      enableGlobalShortcut={false}
    />,
  );
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'pay' } });
}

describe('CommandPalette — Payments for owners (D11)', () => {
  it('shows Payments to a unit owner', () => {
    renderPalette(true);
    expect(screen.getByRole('option', { name: /payments/i })).toBeInTheDocument();
  });

  it('hides Payments from a tenant', () => {
    renderPalette(false);
    expect(screen.queryByRole('option', { name: /payments/i })).not.toBeInTheDocument();
  });
});

function renderMobileSearch(isUnitOwner: boolean) {
  render(
    <MobileSearchContent
      communityId={42}
      role="resident"
      isUnitOwner={isUnitOwner}
      features={FINANCE_ON}
      resourceAccess={{} as never}
    />,
  );
}

describe('MobileSearchContent — Payments for owners (D11)', () => {
  it('shows Payments to a unit owner', () => {
    renderMobileSearch(true);
    expect(screen.getByText('Payments')).toBeInTheDocument();
  });

  it('hides Payments from a tenant', () => {
    renderMobileSearch(false);
    expect(screen.queryByText('Payments')).not.toBeInTheDocument();
  });
});
