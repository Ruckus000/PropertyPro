/**
 * A smoke test for every screen that renders the shared table.
 *
 * Nine components consume `DataTable` — including the finance ledger and the
 * delinquency table — and before this file not one of them had a test of any
 * kind. They are gathered here rather than split across nine files because each
 * asks the same question of a different screen: given one row, does a row of
 * cells reach the DOM? Nine files of that would be nine copies of the same
 * scaffolding.
 *
 * These exist to catch the failure mode a characterization test on the table
 * itself cannot see: a consumer whose column definitions stop rendering because
 * the renderer beneath them changed. So each one asserts real cell CONTENT, not
 * that a `<table>` exists.
 *
 * Rows carry only the fields their columns read; everything else is cast away
 * deliberately, because widening the fixtures to satisfy the full domain types
 * would make the file about types rather than about rendering.
 */
import { describe, expect, it, vi } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// `vi.mock` factories are hoisted above the module body, so anything they close
// over has to be hoisted with them or it is still in the temporal dead zone.
const { query, mutation } = vi.hoisted(() => ({
  query: <T,>(data: T) => ({ data, isLoading: false, isError: false, refetch: () => {} }),
  mutation: () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false }),
}));

vi.mock('@/hooks/use-finance', () => ({
  useDelinquency: () =>
    query([
      {
        unitId: 7,
        unitLabel: '7A',
        ownerName: 'Dana Reyes',
        overdueAmountCents: 125_00,
        daysOverdue: 45,
        lienEligible: false,
      },
    ]),
  useLedger: () =>
    query([
      {
        id: 1,
        createdAt: '2026-03-01T00:00:00.000Z',
        entryType: 'payment',
        description: 'March assessment',
        unitId: 7,
        unitLabel: '7A',
        amountCents: -125_00,
      },
    ]),
  useWaiveLateFees: mutation,
}));

vi.mock('@/hooks/use-arc', () => ({
  useArcSubmissions: () =>
    query([
      {
        id: 1,
        title: 'Repaint front door',
        projectType: 'exterior_paint',
        unitId: 7,
        status: 'pending',
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    ]),
}));

vi.mock('@/hooks/use-denied-visitors', () => ({
  useDeniedVisitors: () =>
    query([
      {
        id: 1,
        fullName: 'Chris Vaughn',
        reason: 'Trespass notice',
        vehiclePlate: 'FL-1234',
        deniedByUserId: 'user-1',
        createdAt: '2026-03-01T00:00:00.000Z',
        isActive: true,
      },
    ]),
  useUpdateDeniedVisitor: mutation,
  useDeleteDeniedVisitor: mutation,
  // Reached through the tab's create dialog, not the table.
  useCreateDeniedVisitor: mutation,
  fetchDeniedMatches: async () => [],
}));

// Not a query hook: it returns a bag, and the default filter maps `leases`
// straight to `{ kind: 'lease', lease }` rows.
vi.mock('@/hooks/use-leases', () => ({
  useEnrichedLeases: () => ({
    leases: [
      {
        id: 1,
        unitId: 12,
        unitNumber: '12B',
        residentName: 'Ada Fisher',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        rentAmountCents: 210_000,
        status: 'active',
      },
    ],
    units: [],
    isLoading: false,
    isError: false,
    hasEnrichmentError: false,
  }),
  // Reached through the lease dialogs, not the table.
  useCreateLease: mutation,
  useUpdateLease: mutation,
  useLeases: () => query([]),
  useRenewalChain: () => query([]),
  useResidentList: () => query([]),
  LEASE: {},
}));

vi.mock('@/hooks/use-packages', () => ({
  usePackages: () =>
    query([
      {
        id: 1,
        recipientName: 'Ada Fisher',
        unitId: 12,
        carrier: 'UPS',
        trackingNumber: '1Z999',
        createdAt: '2026-03-01T00:00:00.000Z',
        status: 'awaiting_pickup',
        pickedUpAt: null,
      },
    ]),
  usePickupPackage: mutation,
  // Reached through the log-a-package form, not the table.
  useCreatePackage: mutation,
}));

vi.mock('@/hooks/use-visitors', () => ({
  useVisitors: () =>
    query([
      {
        id: 1,
        visitorName: 'Sam Okafor',
        purpose: 'Delivery',
        guestType: 'vendor',
        hostUnitId: 12,
        hostUnitLabel: '12B',
        // The staff view opens on its "today" filter, so a fixed past date
        // would be filtered out before it ever reached a row.
        expectedArrival: new Date().toISOString(),
        expectedDurationMinutes: 60,
        checkedInAt: null,
        checkedOutAt: null,
        passCode: 'AB12',
      },
    ]),
  useCheckinVisitor: mutation,
  useCheckoutVisitor: mutation,
  useRevokeVisitor: mutation,
  // Reached through the registration form, not the table.
  useCreateVisitor: mutation,
}));

import { DocumentsTable } from '@/components/documents/documents-table';
import { PortfolioTable } from '@/components/pm/PortfolioTable';
import { DelinquencyTable } from '@/components/finance/delinquency-table';
import { LedgerTable } from '@/components/finance/ledger-table';
import { ArcSubmissionsTab } from '@/components/violations/ArcSubmissionsTab';
import { DeniedVisitorsTab } from '@/components/visitors/DeniedVisitorsTab';
import { LeaseListPage } from '@/components/leases/LeaseListPage';
import { PackageStaffView } from '@/components/packages/PackageStaffView';
import { VisitorStaffView } from '@/components/visitors/VisitorStaffView';

/**
 * Every screen renders inside a QueryClientProvider. The data hooks above are
 * mocked, but some of these components still reach React Query directly — the
 * lease list calls `useQueryClient` for invalidation — and a missing provider
 * throws before a single row is rendered.
 */
function render(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('documents', () => {
  it('renders a document row', () => {
    render(
      <DocumentsTable
        rows={
          [
            {
              kind: 'document',
              id: 1,
              state: 'posted',
              requirement: null,
              document: {
                id: 1,
                title: 'Budget 2026',
                categoryId: 1,
                fileName: 'budget.pdf',
                fileSize: 1024,
                mimeType: 'application/pdf',
                description: null,
                createdAt: '2026-03-01T00:00:00.000Z',
                uploadedBy: null,
              },
            },
          ] as never
        }
        isLoading={false}
        selectedId={null}
        showStatutoryColumns={false}
        categoryNameById={new Map([[1, 'Financial']]) as never}
        onSelectDocument={vi.fn()}
      />,
    );

    expect(screen.getByText('Budget 2026')).toBeDefined();
  });
});

describe('pm portfolio', () => {
  it('renders a community row', () => {
    render(
      <PortfolioTable
        data={[{ communityId: 3, communityName: 'Sunset Condos' }] as never}
        totalCount={1}
        isLoading={false}
        pagination={{ pageIndex: 0, pageSize: 10 }}
        onPaginationChange={vi.fn()}
        sorting={[]}
        onSortingChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Sunset Condos')).toBeDefined();
  });
});

describe('finance', () => {
  it('renders a delinquency row', () => {
    render(<DelinquencyTable communityId={1} />);
    expect(screen.getByText('Dana Reyes')).toBeDefined();
  });

  it('renders a ledger row', () => {
    render(<LedgerTable communityId={1} />);
    expect(screen.getByText('March assessment')).toBeDefined();
  });
});

describe('governance and operations', () => {
  it('renders an ARC submission row', () => {
    render(<ArcSubmissionsTab communityId={1} />);
    expect(screen.getByText('Repaint front door')).toBeDefined();
  });

  it('renders a denied-visitor row', () => {
    render(<DeniedVisitorsTab communityId={1} />);
    expect(screen.getByText('Chris Vaughn')).toBeDefined();
  });

  it('renders a lease row', () => {
    render(<LeaseListPage communityId={1} />);
    expect(screen.getByText('12B')).toBeDefined();
  });

  it('renders a package row', () => {
    render(<PackageStaffView communityId={1} />);
    expect(screen.getByText('Ada Fisher')).toBeDefined();
  });

  it('renders a visitor row, including the accessor-only Purpose column', () => {
    render(<VisitorStaffView communityId={1} />);
    expect(screen.getByText('Sam Okafor')).toBeDefined();
    // `purpose` has no `cell` — it renders through the default value path, which
    // is the seam most likely to break silently under a new renderer.
    expect(screen.getByText('Delivery')).toBeDefined();
  });
});
