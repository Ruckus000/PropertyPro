/**
 * Unit tests for CancelCommunityDialog (post-B5 split).
 *
 * The component now delegates data fetching/mutation to
 * `useCancelPreview` / `useCancelCommunity`. These tests mock that hook
 * module and render the dialog — that's the useful integration boundary.
 *
 * Tests cover:
 * - Portfolio downgrade warning render
 * - CONFIRM gate enabling the destructive button
 * - Cancel success → onCanceled + onClose + confirm reset
 * - Mutation error literal render
 * - handleClose resets confirm text + calls mutation.reset()
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CancelPreview } from '../../src/hooks/use-cancel-community';

const useCancelPreviewMock = vi.fn();
const useCancelCommunityMock = vi.fn();

vi.mock('@/hooks/use-cancel-community', () => ({
  useCancelPreview: (communityId: number, enabled: boolean) =>
    useCancelPreviewMock(communityId, enabled),
  useCancelCommunity: (communityId: number) =>
    useCancelCommunityMock(communityId),
}));

import { CancelCommunityDialog } from '../../src/components/pm/cancel-community-dialog';

const downgrade: CancelPreview = {
  previousTier: 'tier_15',
  newTier: 'tier_10',
  perCommunityBreakdown: [],
  portfolioMonthlyDeltaUsd: -42.5,
};

interface MutationStub {
  mutate: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  isPending?: boolean;
  error?: Error | null;
}

function makeMutation(overrides: Partial<MutationStub> = {}): MutationStub {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null,
    ...overrides,
  };
}

function setup(opts: {
  previewData?: CancelPreview;
  mutation?: MutationStub;
  onClose?: () => void;
  onCanceled?: () => void;
}) {
  const mutation = opts.mutation ?? makeMutation();
  useCancelPreviewMock.mockReturnValue({ data: opts.previewData });
  useCancelCommunityMock.mockReturnValue(mutation);
  const onClose = opts.onClose ?? vi.fn();
  const onCanceled = opts.onCanceled ?? vi.fn();
  render(
    <CancelCommunityDialog
      open
      onClose={onClose}
      communityId={42}
      communityName="Sunset Condos"
      onCanceled={onCanceled}
    />,
  );
  return { mutation, onClose, onCanceled };
}

beforeEach(() => {
  useCancelPreviewMock.mockReset();
  useCancelCommunityMock.mockReset();
});

describe('CancelCommunityDialog', () => {
  it('renders the portfolio downgrade warning', () => {
    setup({ previewData: downgrade });
    expect(screen.getByText('Portfolio discount will decrease')).toBeDefined();
    expect(screen.getByText(/\$42\.50\/mo more/)).toBeDefined();
  });

  it('does not render the warning when tiers are unchanged', () => {
    setup({
      previewData: {
        ...downgrade,
        previousTier: 'tier_10',
        newTier: 'tier_10',
      },
    });
    expect(screen.queryByText('Portfolio discount will decrease')).toBeNull();
  });

  it('disables the destructive button until CONFIRM is typed', () => {
    setup({ previewData: downgrade });
    const button = screen.getByRole('button', { name: 'Cancel Community' });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Type/), {
      target: { value: 'CONFIRM' },
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('on cancel success calls onCanceled then onClose and resets confirm', () => {
    const mutation = makeMutation();
    mutation.mutate.mockImplementation((_input, opts) => opts?.onSuccess?.());
    const { onClose, onCanceled } = setup({
      previewData: downgrade,
      mutation,
    });

    const input = screen.getByLabelText(/Type/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'CONFIRM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Community' }));

    expect(mutation.mutate).toHaveBeenCalled();
    expect(onCanceled).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  it('renders the mutation error message verbatim', () => {
    setup({
      previewData: downgrade,
      mutation: makeMutation({ error: new Error('Cancel failed') }),
    });
    expect(screen.getByText('Cancel failed')).toBeDefined();
  });

  it('handleClose resets confirm text and calls mutation.reset + onClose', () => {
    const mutation = makeMutation();
    const { onClose } = setup({ previewData: downgrade, mutation });

    const input = screen.getByLabelText(/Type/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'CONFIRM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Keep Community' }));

    expect(input.value).toBe('');
    expect(mutation.reset).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
