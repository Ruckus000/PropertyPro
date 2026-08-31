/**
 * Component test for FeePolicySettings (B5 batch #2 drain).
 *
 * Data now flows through the `use-fee-policy` TanStack Query hooks, mocked
 * here so each data-state render and the preserved error literal can be
 * asserted directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useFeePolicyMock = vi.fn();
// `useUpdateFeePolicy` is still mocked because the module exports it, but the
// component no longer calls it — there is nothing left to update (F-16).
const useUpdateFeePolicyMock = vi.fn();

vi.mock('@/hooks/use-fee-policy', () => ({
  useFeePolicy: (id: number) => useFeePolicyMock(id),
  useUpdateFeePolicy: (id: number) => useUpdateFeePolicyMock(id),
}));

import { FeePolicySettings } from '../../src/components/finance/fee-policy-settings';

function makeMutation(overrides: Record<string, unknown> = {}) {
  return { mutate: vi.fn(), isPending: false, isError: false, error: null, ...overrides };
}

beforeEach(() => {
  useFeePolicyMock.mockReset();
  useUpdateFeePolicyMock.mockReset();
  useUpdateFeePolicyMock.mockReturnValue(makeMutation());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('FeePolicySettings', () => {
  it('renders the loading skeleton while pending', () => {
    useFeePolicyMock.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    });
    const { container } = render(<FeePolicySettings communityId={1} />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders the fixed AlertBanner copy on query error', () => {
    useFeePolicyMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    });
    render(<FeePolicySettings communityId={1} />);
    expect(
      screen.getByText('Failed to load fee policy settings.'),
    ).toBeInTheDocument();
  });

  // ── The choice is gone (F-16) ────────────────────────────────────────────
  //
  // These three blocks previously drove a two-option radio group: select
  // `association_absorbs`, assert the Save button appears, assert the mutation
  // fires, assert an unsaved selection is dropped on community switch. All of
  // that described `owner_pays` being selectable, which is the defect — the fee
  // was computed at card rates and applied to debit cards, which card-network
  // rules prohibit. The mode was retired rather than repaired, so there is
  // nothing to select and no mutation to fire.

  it('offers NO way to pass fees to unit owners', () => {
    useFeePolicyMock.mockReturnValue({
      data: 'association_absorbs',
      isPending: false,
      isError: false,
    });
    render(<FeePolicySettings communityId={1} />);

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByText(/Pass fees to unit owners/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save Changes' }),
    ).not.toBeInTheDocument();
  });

  it('states the policy that is actually in force', () => {
    useFeePolicyMock.mockReturnValue({
      data: 'association_absorbs',
      isPending: false,
      isError: false,
    });
    render(<FeePolicySettings communityId={1} />);

    expect(screen.getByText('Association absorbs fees')).toBeInTheDocument();
  });

  it('tells a community with owner_pays STORED that it is no longer used', () => {
    // The stored value is deliberately not deleted, so it still reads back.
    // Silently rendering a different setting than the one saved would leave a
    // PM believing they had configured something they had not.
    useFeePolicyMock.mockReturnValue({
      data: 'owner_pays',
      isPending: false,
      isError: false,
    });
    render(<FeePolicySettings communityId={1} />);

    expect(
      screen.getByText('Your previous fee setting is no longer used'),
    ).toBeInTheDocument();
    expect(screen.getByText(/card-network rules do not permit/)).toBeInTheDocument();
  });

  it('shows no such banner for a community that never used owner_pays', () => {
    useFeePolicyMock.mockReturnValue({
      data: 'association_absorbs',
      isPending: false,
      isError: false,
    });
    render(<FeePolicySettings communityId={1} />);

    expect(
      screen.queryByText('Your previous fee setting is no longer used'),
    ).not.toBeInTheDocument();
  });

});
