import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationsHub } from '../../../src/components/operations/operations-hub';

const {
  replaceMock,
  useQueryMock,
  useOperationsMock,
  useWorkOrdersMock,
  useReservationsMock,
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  useQueryMock: vi.fn(),
  useOperationsMock: vi.fn(),
  useWorkOrdersMock: vi.fn(),
  useReservationsMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  usePathname: () => '/communities/42/operations',
  useSearchParams: () => new URLSearchParams('tab=reservations'),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: useQueryMock,
  };
});

vi.mock('@/hooks/use-operations', () => ({
  useOperations: useOperationsMock,
  useWorkOrders: useWorkOrdersMock,
  useReservations: useReservationsMock,
}));

vi.mock('@/lib/api/maintenance-requests', () => ({
  listMyRequests: vi.fn(),
}));

describe('OperationsHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: { data: [] },
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

  it('renders accessible tabs and panels for only the enabled sections', () => {
    render(
      <OperationsHub
        communityId={42}
        requestsEnabled={true}
        workOrdersEnabled={false}
        reservationsEnabled={true}
      />,
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
    expect(screen.getByText('Reservation #17')).toBeInTheDocument();
  });
});
