import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';

// vi.mock hoists to the TOP of the file — placed here so it applies to the
// dynamic import inside the beforeAll block.

// The searchParams string is settable by each test via this module-level variable,
// read at mock-call time so each test can override.
let currentSearchParamsString = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/communities/42/operations',
  useSearchParams: () => new URLSearchParams(currentSearchParamsString),
}));

vi.mock('@/hooks/use-operations', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-operations')>('@/hooks/use-operations');
  return {
    ...actual,
    useMaintenanceRequests: () => ({
      isLoading: false,
      error: null,
      data: { data: [], meta: { total: 0, page: 1, limit: 20 } },
    }),
    useOperations: () => ({
      isLoading: false,
      error: null,
      data: { data: [], meta: { partialFailure: false, unavailableSources: [] } },
    }),
    useWorkOrders: () => ({
      isLoading: false,
      error: null,
      data: { data: [], meta: { page: 1, limit: 20, total: 0 } },
    }),
    useReservations: () => ({
      isLoading: false,
      error: null,
      data: { data: [], meta: { page: 1, limit: 20, total: 0 } },
    }),
  };
});

vi.mock('../../../src/components/operations/RequestCreateSheet', () => ({
  RequestCreateSheet: (props: { open: boolean }) =>
    props.open ? <div data-testid="request-sheet-open" /> : null,
}));
vi.mock('../../../src/components/operations/WorkOrderCreateSheet', () => ({
  WorkOrderCreateSheet: (props: { open: boolean }) =>
    props.open ? <div data-testid="wo-sheet-open" /> : null,
}));
vi.mock('../../../src/components/operations/ReservationCreateSheet', () => ({
  ReservationCreateSheet: (props: { open: boolean }) =>
    props.open ? <div data-testid="res-sheet-open" /> : null,
}));

describe('OperationsHub — OPERATIONS_HUB_CREATE_SHEETS=off fallback', () => {
  const originalEnv = process.env.OPERATIONS_HUB_CREATE_SHEETS;
  let OperationsHub: typeof import('../../../src/components/operations/operations-hub').OperationsHub;

  beforeAll(async () => {
    // Set env BEFORE the first import of the hub module so the module-level
    // constant CREATE_SHEETS_ENABLED captures the 'off' state.
    process.env.OPERATIONS_HUB_CREATE_SHEETS = 'off';
    vi.resetModules();
    ({ OperationsHub } = await import('../../../src/components/operations/operations-hub'));
  });

  afterAll(() => {
    process.env.OPERATIONS_HUB_CREATE_SHEETS = originalEnv;
    // Do NOT call vi.resetModules() here — it invalidates caches for other
    // test suites running in the same worker and can cause unrelated flakes.
  });

  it('emits a Link with the legacy href instead of a button when flag=off', () => {
    currentSearchParamsString = 'tab=requests';

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

    const link = screen.getByRole('link', { name: 'Submit Request' });
    expect(link).toHaveAttribute('href', '/maintenance/submit?communityId=42');
  });

  it('ignores ?create=request when flag=off (sheet does NOT open)', () => {
    currentSearchParamsString = 'tab=requests&create=request';

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

    expect(screen.queryByTestId('request-sheet-open')).not.toBeInTheDocument();
    // Still renders the legacy link as the CTA.
    expect(screen.getByRole('link', { name: 'Submit Request' })).toBeInTheDocument();
  });
});
