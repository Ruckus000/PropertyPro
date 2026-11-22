import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationsHub } from '../../../src/components/operations/operations-hub';

const {
  searchParamsMock,
  replaceMock,
  pushMock,
  backMock,
  useMaintenanceRequestsMock,
  useOperationsMock,
  useWorkOrdersMock,
  useReservationsMock,
  useAmenitiesMock,
  cancelMutateAsync,
} = vi.hoisted(() => ({
  searchParamsMock: vi.fn(),
  replaceMock: vi.fn(),
  pushMock: vi.fn(),
  backMock: vi.fn(),
  useMaintenanceRequestsMock: vi.fn(),
  useOperationsMock: vi.fn(),
  useWorkOrdersMock: vi.fn(),
  useReservationsMock: vi.fn(),
  useAmenitiesMock: vi.fn(),
  cancelMutateAsync: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock, back: backMock }),
  usePathname: () => '/communities/42/operations',
  useSearchParams: () => new URLSearchParams(searchParamsMock()),
}));

vi.mock('@/hooks/use-operations', async () => {
  // Preserve non-hook exports (constants, parsers) so the hub can import them
  // at module load without the test having to stub each one.
  const actual = await vi.importActual<typeof import('@/hooks/use-operations')>(
    '@/hooks/use-operations',
  );
  return {
    ...actual,
    useMaintenanceRequests: useMaintenanceRequestsMock,
    useOperations: useOperationsMock,
    useWorkOrders: useWorkOrdersMock,
    useReservations: useReservationsMock,
    useAmenities: useAmenitiesMock,
    useCancelReservation: () => ({ mutateAsync: cancelMutateAsync, isPending: false }),
  };
});

vi.mock('../../../src/components/operations/RequestCreateSheet', () => ({
  RequestCreateSheet: (props: {
    open: boolean;
    onClose: () => void;
    defaultUnitId?: number;
    defaultUnitLabel?: string;
  }) =>
    props.open ? (
      <div>
        <div role="heading">Submit Request</div>
        <div data-testid="request-sheet-unit">{`${props.defaultUnitId ?? ''}|${props.defaultUnitLabel ?? ''}`}</div>
        <button type="button" onClick={props.onClose}>Close sheet</button>
      </div>
    ) : null,
}));
vi.mock('../../../src/components/operations/WorkOrderCreateSheet', () => ({
  WorkOrderCreateSheet: (props: { open: boolean }) =>
    props.open ? <div role="heading">Dispatch Work Order</div> : null,
}));
vi.mock('../../../src/components/operations/ReservationCreateSheet', () => ({
  ReservationCreateSheet: (props: { open: boolean; initialAmenityId?: number }) =>
    props.open ? <div role="heading">Reserve Amenity {props.initialAmenityId ?? ''}</div> : null,
}));
vi.mock('../../../src/components/operations/AmenityFormSheet', () => ({
  AmenityFormSheet: (props: { open: boolean; amenity?: { name: string } }) =>
    props.open ? <div role="heading">{props.amenity ? `Edit ${props.amenity.name}` : 'Add amenity'}</div> : null,
}));

const POOL = {
  id: 9,
  name: 'Pool',
  description: null,
  location: 'Building A',
  capacity: 40,
  isBookable: true,
  bookingRules: { maxDurationMinutes: 120 },
};
const SAUNA_CLOSED = { ...POOL, id: 10, name: 'Sauna', isBookable: false, bookingRules: {} };

function amenities(list: unknown[]) {
  useAmenitiesMock.mockReturnValue({ isLoading: false, error: null, data: list });
}

// Opening a sheet writes the URL with history.pushState, which Next syncs into
// useSearchParams without re-rendering the force-dynamic page on the server.
// Stubbed so jsdom's location stays put between tests.
const historyPush = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});

describe('OperationsHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock.mockReturnValue('tab=reservations');
    amenities([POOL]);

    useMaintenanceRequestsMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: { data: [], meta: { total: 0, page: 1, limit: 20 } },
    });
    useOperationsMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        data: [],
        meta: {
          partialFailure: false,
          unavailableSources: [],
        },
      },
    });
    useWorkOrdersMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: { data: [], meta: { page: 1, limit: 20, total: 0 } },
    });
    useReservationsMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        data: [{
          id: 17,
          amenityId: 9,
          unitId: 12,
          status: 'confirmed',
          startTime: '2026-03-28T14:00:00.000Z',
          endTime: '2026-03-28T15:00:00.000Z',
          notes: null,
          createdAt: '2026-03-27T14:00:00.000Z',
          updatedAt: '2026-03-27T14:00:00.000Z',
        }],
        meta: { page: 1, limit: 20, total: 1 },
      },
    });
  });

  it('renders accessible tabs and resident CTA for enabled sections', async () => {
    render(
      <OperationsHub
        communityId={42}
        requestsEnabled={true}
        workOrdersEnabled={false}
        reservationsEnabled={true}
        requestScope="mine"
        isAdmin={false}
        userId="u-1"
        communityTimezone="America/New_York"
      />,
    );

    expect(useMaintenanceRequestsMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        scope: 'mine',
        enabled: true,
        params: expect.objectContaining({ page: 1, limit: 20 }),
      }),
    );
    expect(screen.getByRole('tablist', { name: 'Operations tabs' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'All' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Work Orders' })).not.toBeInTheDocument();

    const reservationsTab = screen.getByRole('tab', { name: 'Reservations' });
    expect(reservationsTab).toHaveAttribute('aria-selected', 'true');
    expect(reservationsTab).toHaveAttribute('aria-controls', 'operations-panel-reservations');

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('id', 'operations-panel-reservations');
    expect(panel).toHaveAttribute('aria-labelledby', 'operations-tab-reservations');

    // The bug-pinning assertion that was fixed by Phase 2:
    // Reservations tab MUST show "Reserve Amenity", NOT "Submit Request".
    expect(screen.getByRole('button', { name: 'Reserve Amenity' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Submit Request' })).not.toBeInTheDocument();
    // Rows name their amenity (loaded on demand).
    expect(await screen.findByRole('heading', { level: 3, name: 'Pool' })).toBeInTheDocument();
  });

  it('loads community-wide requests for staff and shows the request CTA', () => {
    searchParamsMock.mockReturnValue('tab=requests');
    useMaintenanceRequestsMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        data: [{
          id: 99,
          communityId: 42,
          unitId: null,
          submittedById: 'resident-1',
          title: 'Lobby light out',
          description: 'Front entry fixture is dark.',
          status: 'submitted',
          priority: 'high',
          category: 'electrical',
          assignedToId: null,
          resolutionDescription: null,
          resolutionDate: null,
          photos: null,
          createdAt: '2026-03-27T14:00:00.000Z',
          updatedAt: '2026-03-27T14:00:00.000Z',
          comments: [],
        }],
        meta: { total: 1, page: 1, limit: 20 },
      },
    });

    render(
      <OperationsHub
        communityId={42}
        requestsEnabled={true}
        workOrdersEnabled={true}
        reservationsEnabled={false}
        requestScope="community"
        isAdmin={true}
        userId="u-1"
        communityTimezone="America/New_York"
      />,
    );

    expect(useMaintenanceRequestsMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        scope: 'community',
        enabled: true,
        params: expect.objectContaining({ page: 1, limit: 20 }),
      }),
    );
    expect(screen.getByText('Lobby light out')).toBeInTheDocument();
    // Staff on Requests tab still see "Submit Request" (they can submit on behalf).
    expect(screen.getByRole('button', { name: 'Submit Request' })).toBeInTheDocument();
  });

  it('hides the All tab for residents even when maintenance and work orders are both enabled', () => {
    searchParamsMock.mockReturnValue('tab=all');

    render(
      <OperationsHub
        communityId={42}
        requestsEnabled={true}
        workOrdersEnabled={true}
        reservationsEnabled={true}
        requestScope="mine"
        isAdmin={false}
        userId="u-1"
        communityTimezone="America/New_York"
      />,
    );

    expect(screen.queryByRole('tab', { name: 'All' })).not.toBeInTheDocument();

    const selectedTab = screen.getByRole('tab', { selected: true });
    expect(selectedTab).toHaveAccessibleName('Requests');

    expect(useOperationsMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ limit: 50 }),
      expect.objectContaining({ enabled: false }),
    );
  });

  // ── Phase 1 regression tests ──────────────────────────────────────────────

  it('renders timestamps in the community timezone, not browser local', async () => {
    searchParamsMock.mockReturnValue('tab=reservations');
    useReservationsMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        data: [{
          id: 1,
          amenityId: 1,
          unitId: null,
          status: 'confirmed',
          startTime: '2026-03-28T14:00:00.000Z',
          endTime: '2026-03-28T15:00:00.000Z',
          notes: null,
          createdAt: '2026-03-27T14:00:00.000Z',
          updatedAt: '2026-03-27T14:00:00.000Z',
        }],
        meta: { page: 1, limit: 20, total: 1 },
      },
    });

    render(
      <OperationsHub
        communityId={42}
        requestsEnabled={true}
        workOrdersEnabled={false}
        reservationsEnabled={true}
        requestScope="mine"
        isAdmin={false}
        userId="u-1"
        communityTimezone="America/New_York"
      />,
    );

    // 14:00 UTC = 10:00 EDT on 2026-03-28 (DST in effect).
    // Assert rendered text contains 10:00 (or "10 AM") but NOT 14:00 (UTC).
    const panel = screen.getByRole('tabpanel');
    // The list is loaded on demand.
    await waitFor(() => expect(panel.textContent).toMatch(/10:00|10 AM/i));
    expect(panel.textContent).not.toMatch(/14:00/);
  });

  it('passes filter params from URL to the requests query hook', () => {
    searchParamsMock.mockReturnValue('tab=requests&status=new&priority=urgent&page=2');
    useMaintenanceRequestsMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: { data: [], meta: { total: 0, page: 2, limit: 20 } },
    });

    render(
      <OperationsHub
        communityId={42}
        requestsEnabled={true}
        workOrdersEnabled={false}
        reservationsEnabled={false}
        requestScope="mine"
        isAdmin={false}
        userId="u-1"
        communityTimezone="America/New_York"
      />,
    );

    // `page=2` means two steps of rows from the top, not the second slice.
    expect(useMaintenanceRequestsMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        params: expect.objectContaining({ status: 'new', priority: 'urgent', page: 1, limit: 40 }),
      }),
    );
  });

  it('shows Load more button when requests have more pages', () => {
    searchParamsMock.mockReturnValue('tab=requests');
    useMaintenanceRequestsMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        data: [{
          id: 1,
          communityId: 42,
          unitId: null,
          submittedById: 'u-1',
          title: 'Test',
          description: 'Test',
          status: 'new',
          priority: 'normal',
          category: 'general',
          assignedToId: null,
          resolutionDescription: null,
          resolutionDate: null,
          photos: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          comments: [],
        }],
        meta: { total: 40, page: 1, limit: 20 },
      },
    });

    render(
      <OperationsHub
        communityId={42}
        requestsEnabled={true}
        workOrdersEnabled={false}
        reservationsEnabled={false}
        requestScope="mine"
        isAdmin={false}
        userId="u-1"
        communityTimezone="America/New_York"
      />,
    );
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });

  describe('Load more', () => {
    function requestRow(id: number) {
      return {
        id,
        communityId: 42,
        unitId: null,
        submittedById: 'u-1',
        title: `Request ${id}`,
        description: 'Test',
        status: 'submitted',
        priority: 'normal',
        category: 'general',
        assignedToId: null,
        resolutionDescription: null,
        resolutionDate: null,
        photos: null,
        createdAt: '2026-03-27T14:00:00.000Z',
        updatedAt: '2026-03-27T14:00:00.000Z',
        comments: [],
      };
    }

    function renderHub() {
      return render(
        <OperationsHub
          communityId={42}
          requestsEnabled={true}
          workOrdersEnabled={true}
          reservationsEnabled={true}
          requestScope="community"
          isAdmin={true}
          userId="u-1"
          communityTimezone="America/New_York"
        />,
      );
    }

    it('grows the request list from the top: page 1 with limit 40, earlier rows kept', () => {
      const historyReplace = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
      searchParamsMock.mockReturnValue('tab=requests');
      useMaintenanceRequestsMock.mockReturnValue({
        isLoading: false,
        isFetching: false,
        error: null,
        data: { data: [requestRow(1)], meta: { total: 40, page: 1, limit: 20 } },
      });
      const { rerender } = renderHub();

      fireEvent.click(screen.getByRole('button', { name: /load more/i }));
      expect(historyReplace).toHaveBeenCalledWith(null, '', '/communities/42/operations?tab=requests&page=2');

      // Next syncs the new URL into useSearchParams. While the longer list loads
      // the hook keeps the earlier rows (placeholder), so they stay on screen.
      searchParamsMock.mockReturnValue('tab=requests&page=2');
      useMaintenanceRequestsMock.mockReturnValue({
        isLoading: false,
        isFetching: true,
        error: null,
        data: { data: [requestRow(1)], meta: { total: 40, page: 1, limit: 20 } },
      });
      rerender(
        <OperationsHub
          communityId={42}
          requestsEnabled={true}
          workOrdersEnabled={true}
          reservationsEnabled={true}
          requestScope="community"
          isAdmin={true}
          userId="u-1"
          communityTimezone="America/New_York"
        />,
      );

      expect(useMaintenanceRequestsMock).toHaveBeenLastCalledWith(
        42,
        expect.objectContaining({
          keepRowsWhileLoadingMore: true,
          params: expect.objectContaining({ page: 1, limit: 40 }),
        }),
      );
      expect(useWorkOrdersMock).toHaveBeenLastCalledWith(
        42,
        expect.objectContaining({ page: 1, limit: 40 }),
        expect.objectContaining({ keepRowsWhileLoadingMore: true }),
      );
      expect(screen.getByText('Request 1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
      historyReplace.mockRestore();
    });

    it.each(['abc', '0', '-3', '1.5', ''])('reads ?page=%s as page 1', (raw) => {
      searchParamsMock.mockReturnValue(`tab=requests&page=${raw}`);
      renderHub();

      expect(useMaintenanceRequestsMock).toHaveBeenLastCalledWith(
        42,
        expect.objectContaining({ params: expect.objectContaining({ page: 1, limit: 20 }) }),
      );
      expect(useWorkOrdersMock).toHaveBeenLastCalledWith(
        42,
        expect.objectContaining({ page: 1, limit: 20 }),
        expect.anything(),
      );
      expect(useReservationsMock).toHaveBeenLastCalledWith(
        42,
        { page: 1, limit: 20 },
        expect.objectContaining({ keepRowsWhileLoadingMore: true }),
      );
    });

    function reservationsWithTotal(total: number, limit: number) {
      useReservationsMock.mockReturnValue({
        isLoading: false,
        isFetching: false,
        error: null,
        data: {
          data: [{
            id: 17,
            amenityId: 9,
            unitId: 12,
            status: 'confirmed',
            startTime: '2026-03-28T14:00:00.000Z',
            endTime: '2026-03-28T15:00:00.000Z',
            notes: null,
            createdAt: '2026-03-27T14:00:00.000Z',
            updatedAt: '2026-03-27T14:00:00.000Z',
          }],
          meta: { page: 1, limit, total },
        },
      });
    }

    it('offers Load more on reservations below the server cap', async () => {
      searchParamsMock.mockReturnValue('tab=reservations&page=4');
      reservationsWithTotal(150, 80);
      renderHub();

      expect(useReservationsMock).toHaveBeenLastCalledWith(42, { page: 1, limit: 80 }, expect.anything());
      expect(await screen.findByRole('heading', { level: 3, name: 'Pool' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
    });

    it('hides Load more on reservations once the limit reaches the server cap of 100', async () => {
      searchParamsMock.mockReturnValue('tab=reservations&page=5');
      reservationsWithTotal(150, 100);
      const { unmount } = renderHub();

      expect(useReservationsMock).toHaveBeenLastCalledWith(42, { page: 1, limit: 100 }, expect.anything());
      expect(await screen.findByRole('heading', { level: 3, name: 'Pool' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
      unmount();

      // A hand-typed page past the cap never asks for more than the route honours.
      searchParamsMock.mockReturnValue('tab=reservations&page=9');
      renderHub();
      expect(useReservationsMock).toHaveBeenLastCalledWith(42, { page: 1, limit: 100 }, expect.anything());
    });

    const CAP_NOTE = 'Showing 100 of 150 reservations, latest dates first.';

    it('says the reservations list is capped when more exist past the 100 shown', async () => {
      searchParamsMock.mockReturnValue('tab=reservations&page=5');
      reservationsWithTotal(150, 100);
      renderHub();

      expect(await screen.findByText(CAP_NOTE)).toBeInTheDocument();
    });

    it('shows no cap note below the cap, or at the cap with nothing past it', async () => {
      searchParamsMock.mockReturnValue('tab=reservations&page=4');
      reservationsWithTotal(150, 80);
      const { unmount } = renderHub();
      expect(await screen.findByRole('heading', { level: 3, name: 'Pool' })).toBeInTheDocument();
      expect(screen.queryByText(/reservations, latest dates first/)).not.toBeInTheDocument();
      unmount();

      searchParamsMock.mockReturnValue('tab=reservations&page=5');
      reservationsWithTotal(100, 100);
      renderHub();
      expect(await screen.findByRole('heading', { level: 3, name: 'Pool' })).toBeInTheDocument();
      expect(screen.queryByText(/reservations, latest dates first/)).not.toBeInTheDocument();
    });

    it('keeps Load more in its loading state while the last step to 100 loads', async () => {
      // The URL already asks for 100; the rows on screen are the limit-80 placeholder.
      searchParamsMock.mockReturnValue('tab=reservations&page=5');
      reservationsWithTotal(150, 80);
      useReservationsMock.mockReturnValue({ ...useReservationsMock(), isFetching: true });
      renderHub();

      expect(useReservationsMock).toHaveBeenLastCalledWith(42, { page: 1, limit: 100 }, expect.anything());
      expect(await screen.findByRole('heading', { level: 3, name: 'Pool' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
      expect(screen.queryByText(/reservations, latest dates first/)).not.toBeInTheDocument();
    });
  });

  it('still renders the legacy-redirect banner when legacyNotice is set', () => {
    searchParamsMock.mockReturnValue('tab=requests&from=maintenance');
    useMaintenanceRequestsMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: { data: [], meta: { total: 0, page: 1, limit: 20 } },
    });

    render(
      <OperationsHub
        communityId={42}
        requestsEnabled={true}
        workOrdersEnabled={false}
        reservationsEnabled={false}
        requestScope="mine"
        isAdmin={false}
        userId="u-1"
        communityTimezone="America/New_York"
        legacyNotice="You were redirected from a legacy maintenance page."
      />,
    );
    expect(screen.getByText(/redirected from a legacy maintenance page/i)).toBeInTheDocument();
  });

  it('Work Orders tab shows Dispatch Work Order for admins, hides CTA for residents', () => {
    searchParamsMock.mockReturnValue('tab=work-orders');
    const { rerender } = render(
      <OperationsHub
        communityId={42}
        requestsEnabled={true}
        workOrdersEnabled={true}
        reservationsEnabled={false}
        requestScope="community"
        isAdmin={true}
        userId="u-1"
        communityTimezone="America/New_York"
      />,
    );
    expect(screen.getByRole('button', { name: 'Dispatch Work Order' })).toBeInTheDocument();

    rerender(
      <OperationsHub
        communityId={42}
        requestsEnabled={true}
        workOrdersEnabled={true}
        reservationsEnabled={false}
        requestScope="mine"
        isAdmin={false}
        userId="u-1"
        communityTimezone="America/New_York"
      />,
    );
    expect(screen.queryByRole('button', { name: /dispatch work order/i })).not.toBeInTheDocument();
  });

  it('opens a drawer when ?create=request is set in the URL', async () => {
    searchParamsMock.mockReturnValue('tab=requests&create=request');
    render(
      <OperationsHub
        communityId={42}
        requestsEnabled={true}
        workOrdersEnabled={false}
        reservationsEnabled={false}
        requestScope="mine"
        isAdmin={false}
        userId="u-1"
        communityTimezone="America/New_York"
      />,
    );
    // Create-sheets are loaded via next/dynamic, so wait for the chunk.
    expect(await screen.findByRole('heading', { name: /submit request/i })).toBeInTheDocument();
  });

  it("hands the resident's own unit to the request sheet", async () => {
    searchParamsMock.mockReturnValue('tab=requests&create=request');
    render(
      <OperationsHub
        communityId={42}
        requestsEnabled={true}
        workOrdersEnabled={false}
        reservationsEnabled={false}
        requestScope="mine"
        isAdmin={false}
        userId="u-1"
        defaultUnitId={7}
        defaultUnitLabel="Unit 4B"
        communityTimezone="America/New_York"
      />,
    );
    expect(await screen.findByTestId('request-sheet-unit')).toHaveTextContent('7|Unit 4B');
  });

  it('pushes ?create=request when the CTA button is clicked', () => {
    searchParamsMock.mockReturnValue('tab=requests');
    render(
      <OperationsHub
        communityId={42}
        requestsEnabled={true}
        workOrdersEnabled={false}
        reservationsEnabled={false}
        requestScope="mine"
        isAdmin={false}
        userId="u-1"
        communityTimezone="America/New_York"
      />,
    );
    // Both the PageHeader and the empty-state render a "Submit Request"
    // button; either click should push the same URL. Use the first (header).
    const buttons = screen.getAllByRole('button', { name: 'Submit Request' });
    fireEvent.click(buttons[0]!);
    // Open adds a history entry (not replace) so the browser Back button can
    // close the drawer — and does it without a server round trip.
    expect(historyPush).toHaveBeenCalledTimes(1);
    expect(historyPush).toHaveBeenCalledWith(
      null,
      '',
      '/communities/42/operations?tab=requests&create=request',
    );
    expect(pushMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  // A function, not a shared element: rerendering the SAME element object lets
  // React bail out, so the component would never re-read useSearchParams.
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

  it('closing a sheet pops exactly the one entry that opening pushed', async () => {
    searchParamsMock.mockReturnValue('tab=requests');
    const { rerender } = render(hub());
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit Request' })[0]!);
    expect(historyPush).toHaveBeenCalledTimes(1);
    // Next syncs the pushed URL into useSearchParams.
    searchParamsMock.mockReturnValue('tab=requests&create=request');
    rerender(hub());

    fireEvent.click(await screen.findByRole('button', { name: 'Close sheet' }));
    expect(backMock).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  // Browser check of R-6 (2026-11-11 empty-state audit): the legacy
  // /maintenance/submit redirect ARRIVES with create=request. Back there left
  // Operations for the page before the redirect (a tenant landed on /mobile).
  it('closing a sheet the visitor arrived with strips create in place, without Back', async () => {
    const historyReplace = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    searchParamsMock.mockReturnValue('tab=requests&from=maintenance&create=request');
    render(hub());

    fireEvent.click(await screen.findByRole('button', { name: 'Close sheet' }));
    expect(backMock).not.toHaveBeenCalled();
    expect(historyReplace).toHaveBeenCalledWith(
      null,
      '',
      '/communities/42/operations?tab=requests&from=maintenance',
    );
    historyReplace.mockRestore();
  });
});

describe('OperationsHub — amenities', () => {
  const hub = (isAdmin: boolean) => (
    <OperationsHub
      communityId={42}
      requestsEnabled={true}
      workOrdersEnabled={false}
      reservationsEnabled={true}
      requestScope={isAdmin ? 'community' : 'mine'}
      isAdmin={isAdmin}
      userId="u-1"
      communityTimezone="America/New_York"
    />
  );
  const noReservations = { isLoading: false, error: null, data: { data: [], meta: { page: 1, limit: 20, total: 0 } } };

  beforeEach(() => {
    vi.clearAllMocks();
    useMaintenanceRequestsMock.mockReturnValue({ isLoading: false, error: null, data: { data: [], meta: { total: 0, page: 1, limit: 20 } } });
    useOperationsMock.mockReturnValue({ isLoading: false, error: null, data: { data: [], meta: { partialFailure: false, unavailableSources: [] } } });
    useWorkOrdersMock.mockReturnValue({ isLoading: false, error: null, data: { data: [], meta: { page: 1, limit: 20, total: 0 } } });
    useReservationsMock.mockReturnValue(noReservations);
  });

  it('fetches amenities only on the two amenity tabs', () => {
    amenities([]);
    searchParamsMock.mockReturnValue('tab=requests');
    render(hub(true));
    expect(useAmenitiesMock).toHaveBeenLastCalledWith(42, { enabled: false });
  });

  it('offers no Reserve Amenity when nothing can be booked, and a manager gets Add amenity instead', async () => {
    amenities([]);
    searchParamsMock.mockReturnValue('tab=reservations');
    render(hub(true));

    expect(await screen.findByRole('heading', { name: 'Nothing to book yet' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reserve Amenity' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Add amenity' }));
    expect(historyPush).toHaveBeenCalledWith(null, '', '/communities/42/operations?tab=amenities&create=amenity');
  });

  it('gives a resident a calm waiting state with no action when nothing can be booked', async () => {
    amenities([SAUNA_CLOSED]);
    searchParamsMock.mockReturnValue('tab=reservations');
    render(hub(false));

    expect(
      await screen.findByText("When your association opens a space for booking, you'll reserve it here."),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reserve Amenity' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add amenity' })).toBeNull();
  });

  it('names the real bookable amenities when there are no reservations yet', async () => {
    amenities([POOL, SAUNA_CLOSED]);
    searchParamsMock.mockReturnValue('tab=reservations');
    render(hub(false));

    expect(await screen.findByText('You can book Pool. Your reservations appear here.')).toBeInTheDocument();
    // The header's filled one and the empty state's outline one.
    expect(screen.getAllByRole('button', { name: 'Reserve Amenity' })).toHaveLength(2);
  });

  it('names the amenity on each reservation row', async () => {
    amenities([POOL]);
    searchParamsMock.mockReturnValue('tab=reservations');
    useReservationsMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        data: [{
          id: 17, amenityId: 9, unitId: 12, status: 'confirmed',
          startTime: '2099-03-28T14:00:00.000Z', endTime: '2099-03-28T15:00:00.000Z',
          notes: null, createdAt: '2026-03-27T14:00:00.000Z', updatedAt: '2026-03-27T14:00:00.000Z',
        }],
        meta: { page: 1, limit: 20, total: 1 },
      },
    });
    render(hub(false));

    expect(await screen.findByRole('heading', { level: 3, name: 'Pool' })).toBeInTheDocument();
    expect(screen.queryByText(/Reservation #17/)).toBeNull();
  });

  it('shows a manager every amenity with Edit, and a resident only the bookable ones', async () => {
    amenities([POOL, SAUNA_CLOSED]);
    searchParamsMock.mockReturnValue('tab=amenities');
    const { unmount } = render(hub(true));

    expect(await screen.findByRole('heading', { level: 3, name: 'Sauna' })).toBeInTheDocument();
    expect(screen.getByText('Not open for booking')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Pool' })).toBeInTheDocument();
    expect(screen.getByText('Up to 2 hours per booking')).toBeInTheDocument();
    // The header holds the one filled Add amenity once the list has something in it.
    expect(screen.getByRole('button', { name: 'Add amenity' })).toBeInTheDocument();
    unmount();

    render(hub(false));
    expect(await screen.findByRole('heading', { level: 3, name: 'Pool' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Sauna' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Pool' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add amenity' })).toBeNull();
  });

  it('opens the booking sheet preselected from an amenity, and the edit sheet for a manager', async () => {
    amenities([POOL]);
    searchParamsMock.mockReturnValue('tab=amenities');
    const { rerender } = render(hub(true));

    fireEvent.click(await screen.findByRole('button', { name: 'Reserve Pool' }));
    expect(historyPush).toHaveBeenLastCalledWith(null, '', '/communities/42/operations?tab=amenities&create=reservation&amenityId=9');
    searchParamsMock.mockReturnValue('tab=amenities&create=reservation&amenityId=9');
    rerender(hub(true));
    expect(await screen.findByRole('heading', { name: 'Reserve Amenity 9' })).toBeInTheDocument();

    searchParamsMock.mockReturnValue('tab=amenities&create=amenity&amenityId=9');
    rerender(hub(true));
    expect(await screen.findByRole('heading', { name: 'Edit Pool' })).toBeInTheDocument();
  });

  it('gives a manager the setup state, and a resident the waiting state, on an empty Amenities tab', async () => {
    amenities([]);
    searchParamsMock.mockReturnValue('tab=amenities');
    const { unmount } = render(hub(true));
    expect(await screen.findByRole('heading', { name: 'List the spaces residents can book' })).toBeInTheDocument();
    // The setup state owns the only Add amenity.
    expect(screen.getAllByRole('button', { name: 'Add amenity' })).toHaveLength(1);
    unmount();

    render(hub(false));
    expect(await screen.findByRole('heading', { name: 'Spaces you can book appear here' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add amenity' })).toBeNull();
  });

  it('opens no form for an edit link whose amenity is not in this community', async () => {
    amenities([POOL]);
    searchParamsMock.mockReturnValue('tab=amenities&create=amenity&amenityId=99');
    render(hub(true));
    expect(await screen.findByRole('heading', { level: 3, name: 'Pool' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Add amenity' })).toBeNull();
    expect(screen.queryByRole('heading', { name: /^Edit / })).toBeNull();
  });

  it('loads the list for an edit link even without the tab in the URL', async () => {
    amenities([POOL]);
    searchParamsMock.mockReturnValue('create=amenity&amenityId=9');
    render(hub(true));
    expect(useAmenitiesMock).toHaveBeenLastCalledWith(42, { enabled: true });
    expect(await screen.findByRole('heading', { name: 'Edit Pool' })).toBeInTheDocument();
  });
});
