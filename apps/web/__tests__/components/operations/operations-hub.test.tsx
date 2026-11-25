import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
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
vi.mock('../../../src/components/operations/RequestDetailSheet', () => ({
  RequestDetailSheet: (props: { open: boolean; onClose: () => void; requestId: number; isAdmin: boolean }) =>
    props.open ? (
      <div>
        <div role="heading" aria-level={2}>{`Request ${props.requestId}${props.isAdmin ? ' (manager)' : ''}`}</div>
        <button type="button" onClick={props.onClose}>Close request</button>
      </div>
    ) : null,
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

  it('shows a manager every amenity with its name as the edit control, and a resident only the bookable ones', async () => {
    amenities([POOL, SAUNA_CLOSED]);
    searchParamsMock.mockReturnValue('tab=amenities');
    const { unmount } = render(hub(true));

    expect(await screen.findByRole('heading', { level: 3, name: 'Sauna' })).toBeInTheDocument();
    expect(screen.getByText('Not open for booking')).toBeInTheDocument();
    // Owner decision 2026-11-24: the name opens the edit sheet; no separate Edit button.
    const editPool = screen.getByRole('button', { name: 'Edit Pool' });
    expect(editPool).toHaveTextContent(/^Pool$/);
    expect(screen.getAllByRole('button', { name: 'Edit Pool' })).toHaveLength(1);
    expect(screen.getByText('Up to 2 hours per booking')).toBeInTheDocument();
    // The header holds the one filled Add amenity once the list has something in it.
    expect(screen.getByRole('button', { name: 'Add amenity' })).toBeInTheDocument();
    unmount();

    render(hub(false));
    expect(await screen.findByRole('heading', { level: 3, name: 'Pool' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Sauna' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Pool' })).toBeNull();
    // A resident's amenity name is plain text.
    expect(screen.getByRole('heading', { level: 3, name: 'Pool' }).querySelector('button')).toBeNull();
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

describe('OperationsHub — request panel', () => {
  const hub = (isAdmin = false) => (
    <OperationsHub
      communityId={42}
      requestsEnabled={true}
      workOrdersEnabled={false}
      reservationsEnabled={false}
      requestScope={isAdmin ? 'community' : 'mine'}
      isAdmin={isAdmin}
      userId="u-1"
      communityTimezone="America/New_York"
    />
  );
  const leak = {
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

  beforeEach(() => {
    vi.clearAllMocks();
    useMaintenanceRequestsMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: { data: [leak], meta: { total: 1, page: 1, limit: 20 } },
    });
    useOperationsMock.mockReturnValue({ isLoading: false, error: null, data: { data: [], meta: { partialFailure: false, unavailableSources: [] } } });
    useWorkOrdersMock.mockReturnValue({ isLoading: false, error: null, data: { data: [], meta: { page: 1, limit: 20, total: 0 } } });
    useReservationsMock.mockReturnValue({ isLoading: false, error: null, data: { data: [], meta: { page: 1, limit: 20, total: 0 } } });
    amenities([]);
  });

  it('opens the panel for the request named by ?request= (a notification or search link)', async () => {
    searchParamsMock.mockReturnValue('tab=requests&request=7');
    render(hub());
    expect(await screen.findByRole('heading', { name: 'Request 7' })).toBeInTheDocument();
  });

  it('hands the manager flag to the panel, which decides who gets the status control', async () => {
    searchParamsMock.mockReturnValue('tab=requests&request=7');
    render(hub(true));
    expect(await screen.findByRole('heading', { name: 'Request 7 (manager)' })).toBeInTheDocument();
  });

  it('opens no panel for a ?request= that is not a request id', async () => {
    for (const bad of ['abc', '0', '-3', '1.5', '7abc', '0x7', '1e1', ' 7']) {
      searchParamsMock.mockReturnValue(`tab=requests&request=${bad}`);
      const { unmount } = render(hub());
      await screen.findByRole('button', { name: 'Kitchen leak' });
      expect(screen.queryByRole('button', { name: 'Close request' })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('opens no panel when maintenance requests are off for this community', () => {
    searchParamsMock.mockReturnValue('tab=reservations&request=7');
    render(
      <OperationsHub
        communityId={42}
        requestsEnabled={false}
        workOrdersEnabled={false}
        reservationsEnabled={true}
        requestScope="mine"
        isAdmin={false}
        userId="u-1"
        communityTimezone="America/New_York"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Close request' })).not.toBeInTheDocument();
  });

  it('a request row opens its panel with a history entry, and closing pops exactly that entry', async () => {
    searchParamsMock.mockReturnValue('tab=requests');
    const { rerender } = render(hub());

    fireEvent.click(screen.getByRole('button', { name: 'Kitchen leak' }));
    expect(historyPush).toHaveBeenCalledTimes(1);
    expect(historyPush).toHaveBeenCalledWith(null, '', '/communities/42/operations?tab=requests&request=7');
    expect(pushMock).not.toHaveBeenCalled();

    searchParamsMock.mockReturnValue('tab=requests&request=7');
    rerender(hub());
    fireEvent.click(await screen.findByRole('button', { name: 'Close request' }));
    expect(backMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('closing a panel the visitor arrived with strips request in place, without Back', async () => {
    const historyReplace = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    searchParamsMock.mockReturnValue('tab=requests&from=maintenance&request=7');
    render(hub());

    fireEvent.click(await screen.findByRole('button', { name: 'Close request' }));
    expect(backMock).not.toHaveBeenCalled();
    expect(historyReplace).toHaveBeenCalledWith(null, '', '/communities/42/operations?tab=requests&from=maintenance');
    historyReplace.mockRestore();
  });

  it('opens a request from the All tab, but not a work order', () => {
    searchParamsMock.mockReturnValue('tab=all');
    useOperationsMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        data: [
          { id: 7, type: 'maintenance_request', title: 'Kitchen leak', status: 'submitted', priority: 'high', unitId: null, createdAt: '2026-03-27T14:00:00.000Z' },
          { id: 8, type: 'work_order', title: 'Repaint lobby', status: 'created', priority: 'low', unitId: null, createdAt: '2026-03-27T14:00:00.000Z' },
        ],
        meta: { cursor: null, limit: 50, partialFailure: false, unavailableSources: [] },
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
    fireEvent.click(screen.getByRole('button', { name: 'Kitchen leak' }));
    expect(historyPush).toHaveBeenCalledWith(null, '', '/communities/42/operations?tab=all&request=7');
    expect(screen.queryByRole('button', { name: 'Repaint lobby' })).not.toBeInTheDocument();
  });
});

describe('OperationsHub — page kit', () => {
  const hub = (isAdmin: boolean, overrides: Partial<Parameters<typeof OperationsHub>[0]> = {}) => (
    <OperationsHub
      communityId={42}
      requestsEnabled={true}
      workOrdersEnabled={true}
      reservationsEnabled={true}
      requestScope={isAdmin ? 'community' : 'mine'}
      isAdmin={isAdmin}
      userId="u-1"
      communityTimezone="America/New_York"
      {...overrides}
    />
  );
  const request = {
    id: 7, communityId: 42, unitId: null, submittedById: 'u-1', title: 'Kitchen leak',
    description: 'Water under the sink', status: 'submitted', priority: 'high', category: 'plumbing',
    comments: [], createdAt: '2026-03-27T14:00:00.000Z', updatedAt: '2026-03-27T14:00:00.000Z',
  };
  const workOrder = {
    id: 8, title: 'Repaint lobby', description: 'Two coats', unitId: null, vendorId: null, priority: 'low',
    status: 'in_progress', createdAt: '2026-03-27T14:00:00.000Z', updatedAt: '2026-03-27T14:00:00.000Z',
  };
  const booking = {
    id: 17, amenityId: 9, unitId: 12, status: 'confirmed',
    startTime: '2099-03-28T14:00:00.000Z', endTime: '2099-03-28T15:00:00.000Z',
    notes: null, createdAt: '2026-03-27T14:00:00.000Z', updatedAt: '2026-03-27T14:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useMaintenanceRequestsMock.mockReturnValue({ isLoading: false, error: null, data: { data: [request], meta: { total: 1, page: 1, limit: 20 } } });
    useOperationsMock.mockReturnValue({ isLoading: false, error: null, data: { data: [], meta: { cursor: null, limit: 50, partialFailure: false, unavailableSources: [] } } });
    useWorkOrdersMock.mockReturnValue({ isLoading: false, error: null, data: { data: [workOrder], meta: { page: 1, limit: 20, total: 1 } } });
    useReservationsMock.mockReturnValue({ isLoading: false, error: null, data: { data: [booking], meta: { page: 1, limit: 20, total: 1 } } });
    amenities([POOL, SAUNA_CLOSED]);
  });

  it('is a list page whose tabs are an underline strip, not pills', () => {
    searchParamsMock.mockReturnValue('tab=requests');
    const { container } = render(hub(true));

    expect(container.querySelector('[data-page-template="list"]')).not.toBeNull();
    const tablist = screen.getByRole('tablist', { name: 'Operations tabs' });
    expect(tablist.className).toContain('border-b');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'All', 'Requests', 'Work Orders', 'Reservations', 'Amenities',
    ]);
    const selected = screen.getByRole('tab', { selected: true });
    expect(selected).toHaveAccessibleName('Requests');
    expect(selected.className).toContain('border-b-2');
    expect(selected.className).not.toContain('rounded-full');
    // Help-capture manifests select the panel as `section[role="tabpanel"]`.
    expect(screen.getByRole('tabpanel').tagName).toBe('SECTION');
  });

  it('paints the title with a description that fits the viewer', () => {
    searchParamsMock.mockReturnValue('tab=requests');
    const { unmount } = render(hub(true));
    expect(screen.getByRole('heading', { level: 1, name: 'Operations' })).toBeInTheDocument();
    expect(
      screen.getByText('Maintenance requests, work orders and amenity reservations for this community.'),
    ).toBeInTheDocument();
    unmount();

    const resident = render(hub(false));
    expect(
      // The work-orders route limits a resident to their own units.
      screen.getByText('Your maintenance requests and amenity reservations, and work orders for your unit.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/community's work orders/)).toBeNull();
    resident.unmount();

    render(hub(false, { workOrdersEnabled: false, reservationsEnabled: false }));
    expect(screen.getByText('Your maintenance requests.')).toBeInTheDocument();
  });

  it('opens on Requests when the URL names no tab, or one the viewer does not have', () => {
    searchParamsMock.mockReturnValue('');
    const { unmount } = render(hub(true));
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Requests');
    unmount();

    searchParamsMock.mockReturnValue('tab=nonsense');
    render(hub(false));
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Requests');
  });

  it('switching tabs replaces the URL in place and keeps every other key', () => {
    const historyReplace = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    searchParamsMock.mockReturnValue('tab=requests&status=open&priority=high&unitId=5&q=leak&from=maintenance');
    render(hub(true));

    // Radix tabs select on mouse down.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Work Orders' }), { button: 0 });
    expect(historyReplace).toHaveBeenCalledTimes(1);
    expect(historyReplace).toHaveBeenCalledWith(
      null,
      '',
      '/communities/42/operations?tab=work-orders&status=open&priority=high&unitId=5&q=leak&from=maintenance',
    );
    expect(historyPush).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    historyReplace.mockRestore();
  });

  it('feeds status, priority, unitId and cursor from the URL to the lists', () => {
    searchParamsMock.mockReturnValue('tab=all&status=in_progress&priority=high&unitId=5&cursor=abc');
    render(hub(true));

    expect(useOperationsMock).toHaveBeenLastCalledWith(
      42,
      { limit: 50, cursor: 'abc', status: 'in_progress', priority: 'high', unitId: 5 },
      { enabled: true },
    );
    expect(useWorkOrdersMock).toHaveBeenLastCalledWith(
      42,
      expect.objectContaining({ status: 'in_progress', unitId: 5 }),
      expect.anything(),
    );
  });

  it('gives a resident no All tab, no manager action and no side panel', async () => {
    searchParamsMock.mockReturnValue('tab=work-orders');
    const { container, rerender } = render(hub(false));

    expect(screen.queryByRole('tab', { name: 'All' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dispatch Work Order' })).toBeNull();
    expect(container.querySelector('aside')).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();

    searchParamsMock.mockReturnValue('tab=amenities');
    rerender(hub(false));
    expect(await screen.findByRole('heading', { level: 3, name: 'Pool' })).toBeInTheDocument();
    const residentName = screen.getByRole('heading', { level: 3, name: 'Pool' });
    expect(residentName.querySelector('button')).toBeNull();
    expect(residentName.innerHTML).not.toContain('text-content-link');
    expect(screen.queryByRole('button', { name: 'Edit Pool' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add amenity' })).toBeNull();
    expect(screen.queryByText('Open for booking')).toBeNull();
    // A resident still books from the row.
    expect(screen.getByRole('button', { name: 'Reserve Pool' })).toBeInTheDocument();
  });

  it("opens the edit sheet from an amenity's name for a manager, with a history entry", async () => {
    searchParamsMock.mockReturnValue('tab=amenities');
    render(hub(true));

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Sauna' }));
    expect(historyPush).toHaveBeenCalledTimes(1);
    expect(historyPush).toHaveBeenCalledWith(null, '', '/communities/42/operations?tab=amenities&create=amenity&amenityId=10');
    // Reserve stays a row button, only on what can be booked.
    expect(screen.getByRole('button', { name: 'Reserve Pool' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reserve Sauna' })).toBeNull();
  });

  it('shows a work order description in full: the row opens nothing, so there is nowhere else to read it', () => {
    searchParamsMock.mockReturnValue('tab=work-orders');
    render(hub(true));
    const description = screen.getByText('Two coats');
    expect(description.className).not.toContain('truncate');
    expect(description.className).not.toMatch(/line-clamp/);
  });

  it("makes a manager's amenity name a 44px target on a phone, with a ring its heading cannot clip", async () => {
    searchParamsMock.mockReturnValue('tab=amenities');
    render(hub(true));
    const name = await screen.findByRole('button', { name: 'Edit Pool' });
    expect(name).toHaveTextContent(/^Pool$/);
    // Coloured as a link, so a manager can tell it from a resident's plain name.
    expect(name.className.split(' ')).toContain('text-content-link');
    expect(name.className.split(' ')).toContain('hover:underline');
    for (const cls of ['inline-flex', 'items-center', 'min-h-11', 'md:min-h-6', 'focus-visible:ring-inset']) {
      expect(name.className.split(' ')).toContain(cls);
    }
  });

  it('keeps Cancel on a reservation row', async () => {
    searchParamsMock.mockReturnValue('tab=reservations');
    render(hub(false));
    expect(await screen.findByRole('button', { name: 'Cancel Pool reservation' })).toBeInTheDocument();
  });

  it('says each status in words', async () => {
    searchParamsMock.mockReturnValue('tab=requests');
    const { rerender } = render(hub(true));
    const row = (name: string) => screen.getByText(name).closest('li')!;
    expect(row('Kitchen leak').textContent).toContain('Submitted');

    searchParamsMock.mockReturnValue('tab=work-orders');
    rerender(hub(true));
    expect(row('Repaint lobby').textContent).toContain('In Progress');
    expect(row('Repaint lobby').textContent).toContain('Two coats');
    // A work order has no record view: its row holds nothing to press.
    expect(row('Repaint lobby').querySelector('button, a')).toBeNull();

    searchParamsMock.mockReturnValue('tab=reservations');
    rerender(hub(true));
    const booked = (await screen.findByRole('heading', { level: 3, name: 'Pool' })).closest('li')!;
    expect(booked.textContent).toContain('Confirmed');

    searchParamsMock.mockReturnValue('tab=amenities');
    rerender(hub(true));
    const pool = (await screen.findByRole('heading', { level: 3, name: 'Pool' })).closest('li')!;
    expect(pool.textContent).toContain('Open for booking');
  });

  it('labels each row of the mixed list with its kind and status', () => {
    searchParamsMock.mockReturnValue('tab=all');
    useOperationsMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        data: [
          { id: 7, type: 'maintenance_request', title: 'Kitchen leak', status: 'submitted', priority: 'high', unitId: null, createdAt: '2026-03-27T14:00:00.000Z' },
          { id: 8, type: 'work_order', title: 'Repaint lobby', status: 'created', priority: 'low', unitId: null, createdAt: '2026-03-27T14:00:00.000Z' },
        ],
        meta: { cursor: null, limit: 50, partialFailure: false, unavailableSources: [] },
      },
    });
    render(hub(true));
    const leak = screen.getByText('Kitchen leak').closest('li')!;
    expect(leak.textContent).toContain('Submitted');
    expect(leak.textContent).toContain('Maintenance request');
    const paint = screen.getByText('Repaint lobby').closest('li')!;
    expect(paint.textContent).toContain('Created');
    expect(paint.textContent).toContain('Work order');
  });

  it('names a reservation in the mixed list with a capital, like the other kinds', () => {
    searchParamsMock.mockReturnValue('tab=all');
    useOperationsMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        data: [
          { id: 17, type: 'reservation', title: 'Pool booking', status: 'confirmed', priority: 'low', unitId: null, createdAt: '2026-03-27T14:00:00.000Z' },
        ],
        meta: { cursor: null, limit: 50, partialFailure: false, unavailableSources: [] },
      },
    });
    render(hub(true));
    const row = screen.getByText('Pool booking').closest('li')!;
    expect(row.textContent).toContain('Confirmed · Reservation · Created');
  });

  it('puts Load more in the footer of the list it grows', () => {
    searchParamsMock.mockReturnValue('tab=requests');
    useMaintenanceRequestsMock.mockReturnValue({
      isLoading: false,
      isFetching: false,
      error: null,
      data: { data: [request], meta: { total: 40, page: 1, limit: 20 } },
    });
    render(hub(true));
    const more = screen.getByRole('button', { name: 'Load more' });
    const list = screen.getByText('Kitchen leak').closest('ul')!;
    const box = list.parentElement!;
    expect(box.tagName).toBe('SECTION');
    expect(box.getAttribute('role')).toBeNull();
    expect(box.contains(more)).toBe(true);
    expect(list.contains(more)).toBe(false);
  });

  it('offers a retry when a list fails to load', () => {
    const refetch = vi.fn();
    searchParamsMock.mockReturnValue('tab=work-orders');
    useWorkOrdersMock.mockReturnValue({ isLoading: false, error: new Error('boom'), data: undefined, refetch });
    render(hub(true));

    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load work orders.");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations on a manager list, and axe would catch an unnamed row button', async () => {
    searchParamsMock.mockReturnValue('tab=requests');
    const { container } = render(hub(true));
    expect(screen.getByRole('button', { name: 'Kitchen leak' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    // Probe: the audit sees inside the rows.
    screen.getByText('Kitchen leak').closest('li')!.appendChild(document.createElement('button'));
    expect((await axe(container)).violations.map((v) => v.id)).toContain('button-name');
  });

  it('shows a skeleton, not a list, while a tab loads', () => {
    searchParamsMock.mockReturnValue('tab=requests');
    useMaintenanceRequestsMock.mockReturnValue({ isLoading: true, error: null, data: undefined });
    render(hub(true));
    const panel = screen.getByRole('tabpanel');
    expect(panel.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(panel.querySelector('ul')).toBeNull();
  });
});
