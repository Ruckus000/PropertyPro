import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationsHub } from '../../../src/components/operations/operations-hub';

const {
  searchParamsMock,
  replaceMock,
  useMaintenanceRequestsMock,
  useOperationsMock,
  useWorkOrdersMock,
  useReservationsMock,
} = vi.hoisted(() => ({
  searchParamsMock: vi.fn(),
  replaceMock: vi.fn(),
  useMaintenanceRequestsMock: vi.fn(),
  useOperationsMock: vi.fn(),
  useWorkOrdersMock: vi.fn(),
  useReservationsMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  usePathname: () => '/communities/42/operations',
  useSearchParams: () => new URLSearchParams(searchParamsMock()),
}));

vi.mock('@/hooks/use-operations', () => ({
  useMaintenanceRequests: useMaintenanceRequestsMock,
  useOperations: useOperationsMock,
  useWorkOrders: useWorkOrdersMock,
  useReservations: useReservationsMock,
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
      data: [],
    });
    useReservationsMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: [
        {
          id: 17,
          amenityId: 9,
          unitId: 12,
          status: 'confirmed',
          startTime: '2026-03-28T14:00:00.000Z',
          endTime: '2026-03-28T15:00:00.000Z',
          notes: null,
          createdAt: '2026-03-27T14:00:00.000Z',
          updatedAt: '2026-03-27T14:00:00.000Z',
        },
      ],
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
        requestActionHref="/maintenance/submit?communityId=42"
        requestActionLabel="Submit Request"
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
    expect(screen.getByRole('link', { name: 'Submit Request' })).toHaveAttribute(
      'href',
      '/maintenance/submit?communityId=42',
    );
    expect(screen.getByText('Reservation #17')).toBeInTheDocument();
  });

  it('loads community-wide requests for staff and shows the inbox CTA', () => {
    searchParamsMock.mockReturnValue('tab=requests');
    useMaintenanceRequestsMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        data: [
          {
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
          },
        ],
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
        requestActionHref="/maintenance/inbox?communityId=42"
        requestActionLabel="Open Inbox"
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
    expect(screen.getByRole('link', { name: 'Open Inbox' })).toHaveAttribute(
      'href',
      '/maintenance/inbox?communityId=42',
    );
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
        requestActionHref="/maintenance/submit?communityId=42"
        requestActionLabel="Submit Request"
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
      data: [
        {
          id: 1,
          amenityId: 1,
          unitId: null,
          status: 'confirmed',
          startTime: '2026-03-28T14:00:00.000Z',
          endTime: '2026-03-28T15:00:00.000Z',
          notes: null,
          createdAt: '2026-03-27T14:00:00.000Z',
          updatedAt: '2026-03-27T14:00:00.000Z',
        },
      ],
    });

    render(
      <OperationsHub
        communityId={42}
        requestsEnabled={true}
        workOrdersEnabled={false}
        reservationsEnabled={true}
        requestScope="mine"
        requestActionHref="/communities/42/operations?tab=requests"
        requestActionLabel="Submit Request"
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
        communityTimezone="America/New_York"
        legacyNotice="You were redirected from a legacy maintenance page."
      />,
    );
    expect(screen.getByText(/redirected from a legacy maintenance page/i)).toBeInTheDocument();
  });
});
