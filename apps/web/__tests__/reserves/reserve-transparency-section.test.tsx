/**
 * Tests for the reserve-transparency card presentation.
 *
 * Two legal-review invariants are locked here (see the 2026-07-20 redlines):
 *
 *  1. The RUL badge must NEVER render an adequacy traffic-light. Every band
 *     maps to a NON-VALENT StatusBadge key — no `compliant` / `overdue` /
 *     `due_soon` (success/danger/warning). The keys must exist in
 *     STATUS_CONFIG and resolve to a non-valent variant.
 *  2. The funding-figures disclaimer must render beneath the entered cost pair
 *     so the two dollar figures never imply a shortfall/adequacy verdict.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ReserveAssetCard, rulBadge } from '@/components/reserves/reserve-transparency-section';
import type { ReserveAssetRecord, ReserveAssetRulBand } from '@/components/reserves/types';
import { STATUS_CONFIG } from '@/lib/constants/status';
import { RESERVE_FUNDING_FIGURES_DISCLAIMER } from '@/lib/constants/reserve-disclaimers';

const VALENT_KEYS = new Set(['compliant', 'overdue', 'due_soon', 'pending', 'completed', 'rejected']);
const VALENT_VARIANTS = new Set(['success', 'danger', 'warning']);
const ALL_BANDS: ReserveAssetRulBand[] = ['healthy', 'aware', 'urgent', 'past_life'];

describe('rulBadge — non-valent status keys', () => {
  it.each(ALL_BANDS)('band %s maps to a non-valent StatusBadge key that exists in STATUS_CONFIG', (band) => {
    const { status } = rulBadge(band, 5);

    // The key must be defined in the single-source-of-truth config...
    const entry = (STATUS_CONFIG as Record<string, { variant: string }>)[status];
    expect(entry, `status key "${status}" must exist in STATUS_CONFIG`).toBeDefined();

    // ...and must not be one of the adequacy traffic-light keys/variants.
    expect(VALENT_KEYS.has(status)).toBe(false);
    expect(VALENT_VARIANTS.has(entry.variant)).toBe(false);
  });

  it('keeps neutral time-remaining labels (no condition/adequacy words)', () => {
    expect(rulBadge('past_life', -3).label).toBe('Past expected life');
    expect(rulBadge('urgent', 0).label).toBe('Due this year');
    expect(rulBadge('urgent', 2).label).toBe('2 yrs left');
    expect(rulBadge('aware', 4).label).toBe('4 yrs left');
    expect(rulBadge('healthy', 12).label).toBe('12 yrs left');
  });
});

function renderCard(overrides: Partial<ReserveAssetRecord> = {}) {
  const asset: ReserveAssetRecord = {
    id: 1,
    communityId: 1,
    name: 'Main Roof',
    category: 'roof',
    yearInstalled: 2015,
    usefulLifeYears: 25,
    replacementCostCents: 5_000_000,
    currentReserveCents: 1_200_000,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    rulBand: 'healthy',
    yearsRemaining: 14,
    endOfLifeYear: 2040,
    ...overrides,
  };
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <ReserveAssetCard asset={asset} communityId={1} canManage onEdit={() => {}} />
    </QueryClientProvider>,
  );
}

describe('ReserveAssetCard — funding-figures disclaimer', () => {
  it('renders the funding-figures disclaimer beneath the entered cost pair', () => {
    renderCard();
    expect(screen.getByText(RESERVE_FUNDING_FIGURES_DISCLAIMER)).toBeInTheDocument();
  });

  it('still renders the disclaimer when only one dollar figure is entered', () => {
    renderCard({ replacementCostCents: 5_000_000, currentReserveCents: null });
    expect(screen.getByText(RESERVE_FUNDING_FIGURES_DISCLAIMER)).toBeInTheDocument();
  });

  it('omits the disclaimer when the association entered no dollar figures', () => {
    renderCard({ replacementCostCents: null, currentReserveCents: null });
    expect(screen.queryByText(RESERVE_FUNDING_FIGURES_DISCLAIMER)).toBeNull();
  });
});
