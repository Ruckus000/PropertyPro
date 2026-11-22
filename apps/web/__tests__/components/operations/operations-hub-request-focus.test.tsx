/**
 * Closing the request panel returns focus to the card that opened it.
 *
 * The panel is a Radix Sheet opened from URL state, with no `SheetTrigger`, and
 * Radix's own close handler refocuses only a registered trigger, so left alone
 * focus fell to <body>. This file renders the REAL `RequestDetailSheet` and
 * Sheet (the main hub test stubs the panel), because only the real dialog
 * reproduces the drop.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationsHub } from '../../../src/components/operations/operations-hub';

const { searchParamsMock, backMock } = vi.hoisted(() => ({
  searchParamsMock: vi.fn(),
  backMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: backMock }),
  usePathname: () => '/communities/42/operations',
  useSearchParams: () => new URLSearchParams(searchParamsMock()),
}));

const LEAK = {
  id: 7,
  communityId: 42,
  unitId: null,
  submittedById: 'u-1',
  title: 'Kitchen leak',
  description: 'Water under the sink',
  status: 'submitted',
  priority: 'high',
  category: 'plumbing',
  comments: [],
  createdAt: '2026-03-27T14:00:00.000Z',
  updatedAt: '2026-03-27T14:00:00.000Z',
};

vi.mock('@/hooks/use-operations', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-operations')>('@/hooks/use-operations');
  const empty = { isLoading: false, error: null, data: { data: [], meta: { page: 1, limit: 20, total: 0 } } };
  return {
    ...actual,
    useMaintenanceRequests: () => ({
      isLoading: false,
      error: null,
      data: { data: [LEAK], meta: { total: 1, page: 1, limit: 20 } },
    }),
    // The panel's body is not under test: a loading read keeps it to a skeleton.
    useMaintenanceRequest: () => ({ isLoading: true, error: null, data: undefined }),
    useOperations: () => ({
      isLoading: false,
      error: null,
      data: { data: [], meta: { partialFailure: false, unavailableSources: [] } },
    }),
    useWorkOrders: () => empty,
    useReservations: () => empty,
    useAmenities: () => ({ isLoading: false, error: null, data: [] }),
    useCancelReservation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

vi.spyOn(window.history, 'pushState').mockImplementation(() => {});

const hub = () => (
  <OperationsHub
    communityId={42}
    requestsEnabled={true}
    workOrdersEnabled={false}
    reservationsEnabled={false}
    requestScope="mine"
    isAdmin={false}
    userId="u-1"
    communityTimezone="America/New_York"
  />
);

describe('OperationsHub — request panel focus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns focus to the card that opened the panel when it closes', async () => {
    searchParamsMock.mockReturnValue('tab=requests');
    const { rerender } = render(hub());

    const opener = screen.getByRole('button', { name: 'Kitchen leak' });
    opener.focus();
    fireEvent.click(opener);

    // Next syncs the pushed URL into useSearchParams.
    searchParamsMock.mockReturnValue('tab=requests&request=7');
    rerender(hub());
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(backMock).toHaveBeenCalledTimes(1);

    // Back pops the entry, so the panel unmounts.
    searchParamsMock.mockReturnValue('tab=requests');
    await act(async () => {
      rerender(hub());
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
