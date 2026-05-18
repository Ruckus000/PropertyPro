/**
 * Component test for FeePolicySettings (B5 batch #2 drain).
 *
 * Data now flows through the `use-fee-policy` TanStack Query hooks, mocked
 * here so each data-state render and the preserved error literal can be
 * asserted directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const useFeePolicyMock = vi.fn();
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

  it('marks the current policy and only shows actions when dirty', () => {
    useFeePolicyMock.mockReturnValue({
      data: 'owner_pays',
      isPending: false,
      isError: false,
    });
    render(<FeePolicySettings communityId={1} />);

    const ownerRadio = screen.getByRole('radio', {
      name: /Pass fees to unit owners/,
    }) as HTMLInputElement;
    expect(ownerRadio.checked).toBe(true);
    expect(
      screen.queryByRole('button', { name: 'Save Changes' }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('radio', { name: /Association absorbs fees/ }),
    );
    expect(
      screen.getByRole('button', { name: 'Save Changes' }),
    ).toBeInTheDocument();
  });

  it('calls the mutation with the selected policy and clears the selection on success', () => {
    const mutate = vi.fn((_p, opts) => opts.onSuccess());
    useFeePolicyMock.mockReturnValue({
      data: 'owner_pays',
      isPending: false,
      isError: false,
    });
    useUpdateFeePolicyMock.mockReturnValue(makeMutation({ mutate }));

    render(<FeePolicySettings communityId={1} />);
    fireEvent.click(
      screen.getByRole('radio', { name: /Association absorbs fees/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(mutate).toHaveBeenCalledWith(
      'association_absorbs',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    // selection cleared → dirty actions disappear
    expect(
      screen.queryByRole('button', { name: 'Save Changes' }),
    ).not.toBeInTheDocument();
  });

  it('clears an unsaved selection when communityId changes', () => {
    useFeePolicyMock.mockReturnValue({
      data: 'owner_pays',
      isPending: false,
      isError: false,
    });
    const { rerender } = render(<FeePolicySettings communityId={1} />);

    fireEvent.click(
      screen.getByRole('radio', { name: /Association absorbs fees/ }),
    );
    expect(
      screen.getByRole('button', { name: 'Save Changes' }),
    ).toBeInTheDocument();

    rerender(<FeePolicySettings communityId={2} />);
    expect(
      screen.queryByRole('button', { name: 'Save Changes' }),
    ).not.toBeInTheDocument();
  });

  it('renders the mutation error message verbatim', () => {
    useFeePolicyMock.mockReturnValue({
      data: 'owner_pays',
      isPending: false,
      isError: false,
    });
    useUpdateFeePolicyMock.mockReturnValue(
      makeMutation({
        isError: true,
        error: new Error('Failed to update fee policy'),
      }),
    );
    render(<FeePolicySettings communityId={1} />);
    expect(
      screen.getByText('Failed to update fee policy'),
    ).toBeInTheDocument();
  });
});
