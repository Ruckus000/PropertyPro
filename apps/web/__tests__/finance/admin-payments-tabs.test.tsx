/**
 * AdminPaymentsTabs — the flat Payments switcher.
 *
 * Before: "Overview | Assessments" at the top, and "Assessments | Delinquency |
 * Ledger | Recent Payments" again INSIDE Overview — "Assessments" twice meaning
 * the same thing, both levels fighting over the same `?tab=` param, and the
 * inner Assessments tab silently unmounting the whole dashboard. The design
 * prototype (pp-money.js) flattens this to one switcher over four readings of
 * one ledger: Overview / Assessments / Delinquency / Ledger, with recent
 * payments on the overview.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const routerReplace = vi.fn();
let search = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
  usePathname: () => '/communities/3/payments',
  useSearchParams: () => search,
}));

const kpiSpy = vi.fn();
const assessmentSpy = vi.fn();
const delinquencySpy = vi.fn();
const ledgerSpy = vi.fn();

vi.mock('@/components/finance/finance-kpi-row', () => ({
  FinanceKpiRow: (props: { communityId: number; delinquencyEnabled?: boolean }) => {
    kpiSpy(props);
    return <div>KPI Row</div>;
  },
}));
vi.mock('@/components/finance/recent-payments', () => ({
  RecentPayments: () => <div>Recent Payments Content</div>,
}));
vi.mock('@/components/finance/assessment-manager', () => ({
  AssessmentManager: () => {
    assessmentSpy();
    return <div>Assessments Content</div>;
  },
}));
vi.mock('@/components/finance/delinquency-table', () => ({
  DelinquencyTable: () => {
    delinquencySpy();
    return <div>Delinquency Content</div>;
  },
}));
vi.mock('@/components/finance/ledger-table', () => ({
  LedgerTable: () => {
    ledgerSpy();
    return <div>Ledger Content</div>;
  },
}));

import { AdminPaymentsTabs } from '@/app/(authenticated)/communities/[id]/payments/_components/AdminPaymentsTabs';

const BODIES = ['Assessments Content', 'Delinquency Content', 'Ledger Content'];

function renderTabs() {
  return render(<AdminPaymentsTabs communityId={3} userId="user-1" userRole="property_manager" />);
}

beforeEach(() => {
  search = new URLSearchParams();
  routerReplace.mockReset();
  kpiSpy.mockReset();
  assessmentSpy.mockReset();
  delinquencySpy.mockReset();
  ledgerSpy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AdminPaymentsTabs — one switcher', () => {
  it('offers exactly Overview, Assessments, Delinquency and Ledger — no nested level, no Recent Payments tab', () => {
    renderTabs();

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Overview',
      'Assessments',
      'Delinquency',
      'Ledger',
    ]);
  });

  it('mounts only the Overview body on cold entry: KPIs with delinquency enabled, and recent payments', () => {
    renderTabs();

    expect(screen.getByText('KPI Row')).toBeInTheDocument();
    expect(screen.getByText('Recent Payments Content')).toBeInTheDocument();
    // An overview that reads "--" for overdue is not an overview. The old
    // "visit Delinquency first" gate was a fetch-cost policy; the prototype
    // shows overdue balance and delinquent units on the overview outright.
    expect(kpiSpy).toHaveBeenLastCalledWith({ communityId: 3, delinquencyEnabled: true });
    for (const body of BODIES) expect(screen.queryByText(body)).not.toBeInTheDocument();
    expect(assessmentSpy).not.toHaveBeenCalled();
    expect(delinquencySpy).not.toHaveBeenCalled();
    expect(ledgerSpy).not.toHaveBeenCalled();
  });

  it('treats the retired ?tab=payments as Overview, where recent payments now live', () => {
    search = new URLSearchParams('tab=payments');

    renderTabs();

    expect(screen.getByText('Recent Payments Content')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it.each([
    ['assessments', 'Assessments Content'],
    ['delinquency', 'Delinquency Content'],
    ['ledger', 'Ledger Content'],
  ])('?tab=%s mounts only that body — no KPI row, no other view', (tab, body) => {
    search = new URLSearchParams(`tab=${tab}`);

    renderTabs();

    expect(screen.getByText(body)).toBeInTheDocument();
    expect(screen.queryByText('KPI Row')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent Payments Content')).not.toBeInTheDocument();
    for (const other of BODIES.filter((b) => b !== body)) {
      expect(screen.queryByText(other)).not.toBeInTheDocument();
    }
  });

  it('switching views replaces the URL tab, keeps other params, and does not scroll', async () => {
    search = new URLSearchParams('unitId=9');
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole('tab', { name: 'Ledger' }));

    // `replace`, not `push`: Back should leave the page, not walk every tab.
    expect(routerReplace).toHaveBeenCalledWith('/communities/3/payments?unitId=9&tab=ledger', {
      scroll: false,
    });
  });
});
