import { fireEvent, render, screen } from '@testing-library/react';
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
} = vi.hoisted(() => ({
  searchParamsMock: vi.fn(),
  replaceMock: vi.fn(),
  pushMock: vi.fn(),
  backMock: vi.fn(),
  useMaintenanceRequestsMock: vi.fn(),
  useOperationsMock: vi.fn(),
  useWorkOrdersMock: vi.fn(),
  useReservationsMock: vi.fn(),
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
  };
});

vi.mock('../../../src/components/operations/RequestCreateSheet', () => ({
  RequestCreateSheet: (props: { open: boolean; onClose: () => void }) =>
    props.open ? <div role="heading">Submit Request</div> : null,
}));
vi.mock('../../../src/components/operations/WorkOrderCreateSheet', () => ({
  WorkOrderCreateSheet: (props: { open: boolean }) =>
    props.open ? <div role="heading">Dispatch Work Order</div> : null,
}));
vi.mock('../../../src/components/operations/ReservationCreateSheet', () => ({
  ReservationCreateSheet: (props: { open: boolean }) =>
    props.open ? <div role="heading">Reserve Amenity</div> : null,
}));

describe('OperationsHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock.mockReturnValue('tab=reservations');

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

  it('renders accessible tabs and resident CTA for enabled sections', () => {
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
    expect(screen.getByText('Reservation #17')).toBeInTheDocument();
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

  it('renders timestamps in the community timezone, not browser local', () => {
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
    expect(panel.textContent).toMatch(/10:00|10 AM/i);
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

    expect(useMaintenanceRequestsMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        params: expect.objectContaining({ status: 'new', priority: 'urgent', page: 2 }),
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

  it('opens a drawer when ?create=request is set in the URL', () => {
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
    expect(screen.getByRole('heading', { name: /submit request/i })).toBeInTheDocument();
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
    // Open uses push (not replace) so the browser Back button can close the drawer.
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining('create=request'),
    );
  });
});
