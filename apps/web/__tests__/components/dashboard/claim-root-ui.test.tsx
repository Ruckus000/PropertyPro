import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';

const {
  useMyRootlessMock,
  useClaimRootMock,
  useDisputeRootClaimMock,
  searchParamsGetMock,
} = vi.hoisted(() => ({
  useMyRootlessMock: vi.fn(),
  useClaimRootMock: vi.fn(),
  useDisputeRootClaimMock: vi.fn(),
  searchParamsGetMock: vi.fn(),
}));

vi.mock('@/hooks/use-claim-root', () => ({
  useMyRootless: useMyRootlessMock,
  useClaimRoot: useClaimRootMock,
  useDisputeRootClaim: useDisputeRootClaimMock,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: searchParamsGetMock }),
}));

import { ClaimRootBanner } from '@/components/dashboard/ClaimRootBanner';
import { ClaimRootClient } from '@/components/dashboard/ClaimRootClient';

function mutationStub(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue([]),
    isPending: false,
    isError: false,
    data: undefined,
    error: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  searchParamsGetMock.mockReturnValue(null);
  useClaimRootMock.mockReturnValue(mutationStub());
  useDisputeRootClaimMock.mockReturnValue(mutationStub({ mutate: vi.fn() }));
});

describe('ClaimRootBanner', () => {
  it('renders for an admin with rootless communities', () => {
    useMyRootlessMock.mockReturnValue({ data: [{ id: 1, name: 'Sunset', slug: 'sunset' }] });
    render(<ClaimRootBanner isAdmin />);
    expect(screen.getByTestId('claim-root-banner')).toBeInTheDocument();
    expect(screen.getByText(/no root manager/i)).toBeInTheDocument();
  });

  it('does not render for a non-admin', () => {
    useMyRootlessMock.mockReturnValue({ data: undefined });
    render(<ClaimRootBanner isAdmin={false} />);
    expect(screen.queryByTestId('claim-root-banner')).not.toBeInTheDocument();
    // resident never fetches: hook called with enabled=false
    expect(useMyRootlessMock).toHaveBeenCalledWith(false);
  });

  it('does not render when there are no rootless communities', () => {
    useMyRootlessMock.mockReturnValue({ data: [] });
    render(<ClaimRootBanner isAdmin />);
    expect(screen.queryByTestId('claim-root-banner')).not.toBeInTheDocument();
  });

  it('dismisses per-session via sessionStorage', () => {
    useMyRootlessMock.mockReturnValue({ data: [{ id: 1, name: 'Sunset', slug: 'sunset' }] });
    render(<ClaimRootBanner isAdmin />);
    fireEvent.click(screen.getByTestId('claim-root-banner-dismiss'));
    expect(sessionStorage.getItem('claim-root-dismissed')).toBe('1');
    expect(screen.queryByTestId('claim-root-banner')).not.toBeInTheDocument();
  });
});

describe('ClaimRootClient — claim list', () => {
  it('lists rootless communities with per-community + claim-all buttons', () => {
    useMyRootlessMock.mockReturnValue({
      data: [
        { id: 1, name: 'Sunset Condos', slug: 'sunset-condos' },
        { id: 2, name: 'Palm Shores', slug: 'palm-shores' },
      ],
      isLoading: false,
      isError: false,
    });
    render(<ClaimRootClient />);
    expect(screen.getByTestId('claim-all')).toBeInTheDocument();
    expect(screen.getByTestId('claim-1')).toBeInTheDocument();
    expect(screen.getByTestId('claim-2')).toBeInTheDocument();
    expect(screen.getByText(/will be notified/i)).toBeInTheDocument();
  });

  it('shows the result after claiming a single community', async () => {
    const mutateAsync = vi.fn().mockResolvedValue([{ communityId: 1, claimed: true }]);
    useClaimRootMock.mockReturnValue(mutationStub({ mutateAsync }));
    useMyRootlessMock.mockReturnValue({
      data: [{ id: 1, name: 'Sunset Condos', slug: 'sunset-condos' }],
      isLoading: false,
      isError: false,
    });
    render(<ClaimRootClient />);
    fireEvent.click(screen.getByTestId('claim-1'));
    expect(mutateAsync).toHaveBeenCalledWith({ communityId: 1 });
    await waitFor(() => expect(screen.getByText(/you are now the root manager/i)).toBeInTheDocument());
  });

  it('renders the empty state when nothing is rootless', () => {
    useMyRootlessMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<ClaimRootClient />);
    expect(screen.getByText(/all set/i)).toBeInTheDocument();
  });

  it('renders loading skeletons', () => {
    useMyRootlessMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<ClaimRootClient />);
    expect(screen.getByTestId('claim-root-loading')).toBeInTheDocument();
  });
});

describe('ClaimRootClient — dispute card', () => {
  it('does NOT render the dispute card without ?dispute=', () => {
    searchParamsGetMock.mockReturnValue(null);
    useMyRootlessMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<ClaimRootClient />);
    expect(screen.queryByTestId('dispute-card')).not.toBeInTheDocument();
  });

  it('renders the dispute card when ?dispute=<id> is present and confirms', () => {
    searchParamsGetMock.mockReturnValue('42');
    const mutate = vi.fn();
    useDisputeRootClaimMock.mockReturnValue(mutationStub({ mutate }));
    useMyRootlessMock.mockReturnValue({
      data: [{ id: 42, name: 'Disputed Towers', slug: 'disputed' }],
      isLoading: false,
      isError: false,
    });
    render(<ClaimRootClient />);
    const card = screen.getByTestId('dispute-card');
    expect(card).toBeInTheDocument();
    expect(within(card).getByText(/Disputed Towers/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('dispute-confirm'));
    expect(mutate).toHaveBeenCalledWith({ communityId: 42 });
  });

  it('shows the dispute result after success', () => {
    searchParamsGetMock.mockReturnValue('42');
    useDisputeRootClaimMock.mockReturnValue(
      mutationStub({ data: { disputed: true, alreadyOpen: false } }),
    );
    useMyRootlessMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<ClaimRootClient />);
    expect(screen.getByText(/sent it to the platform team/i)).toBeInTheDocument();
  });
});
