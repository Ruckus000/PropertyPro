/**
 * Component test for BrandingCopyDialog (B5 batch #2 drain).
 *
 * The bulk-PATCH fan-out now lives in the `use-pm-branding` hook, mocked
 * here so the confirm flow and preserved result literals can be asserted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const useCopyBrandingMock = vi.fn();

vi.mock('@/hooks/use-pm-branding', async () => {
  const actual = await vi.importActual<
    typeof import('@/hooks/use-pm-branding')
  >('@/hooks/use-pm-branding');
  return { ...actual, useCopyBranding: () => useCopyBrandingMock() };
});

import { BrandingCopyDialog } from '../../src/components/pm/BrandingCopyDialog';

const sourceCommunity = {
  id: 1,
  name: 'Sunset Condos',
  branding: { primaryColor: '#123456', fontHeading: 'Inter' },
};
const managedCommunities = [
  { id: 1, name: 'Sunset Condos' },
  { id: 2, name: 'Palm Shores' },
  { id: 3, name: 'Sunset Ridge' },
];

function makeMutation(overrides: Record<string, unknown> = {}) {
  return { mutate: vi.fn(), isPending: false, reset: vi.fn(), ...overrides };
}

beforeEach(() => {
  useCopyBrandingMock.mockReset();
  useCopyBrandingMock.mockReturnValue(makeMutation());
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderDialog() {
  return render(
    <BrandingCopyDialog
      sourceCommunity={sourceCommunity}
      managedCommunities={managedCommunities}
      open
      onClose={() => {}}
    />,
  );
}

describe('BrandingCopyDialog', () => {
  it('excludes the source community from the target list', () => {
    renderDialog();
    expect(screen.getByText('Palm Shores')).toBeInTheDocument();
    expect(screen.getByText('Sunset Ridge')).toBeInTheDocument();
    expect(screen.queryByLabelText('Sunset Condos')).not.toBeInTheDocument();
  });

  it('walks the review step and calls the mutation with selected ids/properties', () => {
    const mutate = vi.fn();
    useCopyBrandingMock.mockReturnValue(makeMutation({ mutate }));
    renderDialog();

    fireEvent.click(screen.getByLabelText('Palm Shores'));
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    const [input] = mutate.mock.calls[0]!;
    expect(input.sourceBranding).toEqual(sourceCommunity.branding);
    expect(Array.from(input.communityIds)).toEqual([2]);
  });

  it('renders the success result literal', async () => {
    const mutate = vi.fn((_i, opts) =>
      opts.onSuccess({ succeeded: 2, total: 2 }),
    );
    useCopyBrandingMock.mockReturnValue(makeMutation({ mutate }));
    renderDialog();

    fireEvent.click(screen.getByLabelText('Palm Shores'));
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(
        screen.getByText('Branding copied to 2/2 communities'),
      ).toBeInTheDocument(),
    );
  });

  it('renders the error result literal verbatim', async () => {
    const mutate = vi.fn((_i, opts) =>
      opts.onError(new Error('network down')),
    );
    useCopyBrandingMock.mockReturnValue(makeMutation({ mutate }));
    renderDialog();

    fireEvent.click(screen.getByLabelText('Sunset Ridge'));
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(screen.getByText('Error: network down')).toBeInTheDocument(),
    );
  });
});
