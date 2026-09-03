/**
 * FinanceKpiRow — the two derived money KPIs.
 *
 * "Total Assessed" summed the assessment DEFINITIONS, so a $485 monthly
 * assessment read as $485 for a 124-unit community; "Collected This Month" was
 * the literal string "--". Both are derivable from rows the client already
 * fetches: this month's `assessment` ledger entries (one is posted per billed
 * line item) and the paid rows of payment history.
 *
 * Only `Date` is faked — not timers — so `new Date()` inside the component
 * resolves to 15 Sep 2026 local time without disturbing React's scheduler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useAssessmentsMock = vi.fn();
const useDelinquencyMock = vi.fn();
const useLedgerMock = vi.fn();
const useRecentPaymentsMock = vi.fn();

vi.mock('@/hooks/use-finance', () => ({
  useAssessments: (...args: unknown[]) => useAssessmentsMock(...args),
  useDelinquency: (...args: unknown[]) => useDelinquencyMock(...args),
  useLedger: (...args: unknown[]) => useLedgerMock(...args),
  useRecentPayments: (...args: unknown[]) => useRecentPaymentsMock(...args),
}));

import { FinanceKpiRow } from '@/components/finance/finance-kpi-row';

const loaded = <T,>(data: T) => ({ data, isLoading: false });
const loading = () => ({ data: undefined, isLoading: true });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 15, 12, 0, 0)); // 15 Sep 2026, local

  // The definition the OLD code summed: one $485 monthly assessment. If it ever
  // reaches the screen again, the bug is back.
  useAssessmentsMock
    .mockReset()
    .mockReturnValue(loaded([{ id: 1, amountCents: 48500, isActive: true, frequency: 'monthly' }]));
  useDelinquencyMock.mockReset().mockReturnValue(loaded([]));
  useLedgerMock.mockReset().mockReturnValue(loaded([]));
  useRecentPaymentsMock.mockReset().mockReturnValue(loaded([]));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('FinanceKpiRow — Billed This Month', () => {
  it("sums this month's assessment ledger entries, not the assessment definitions", () => {
    useLedgerMock.mockReturnValue(
      loaded([
        { id: 1, entryType: 'assessment', amountCents: 48500 },
        { id: 2, entryType: 'assessment', amountCents: 48500 },
        { id: 3, entryType: 'assessment', amountCents: 92000 },
      ]),
    );

    render(<FinanceKpiRow communityId={7} />);

    expect(screen.getByText('Billed This Month')).toBeInTheDocument();
    expect(screen.getByText('$1,890')).toBeInTheDocument();
    // The definition sum is the defect. It must not appear anywhere.
    expect(screen.queryByText('$485')).not.toBeInTheDocument();
  });

  it('asks the ledger for exactly the current calendar month, at the server cap', () => {
    render(<FinanceKpiRow communityId={7} />);

    expect(useLedgerMock).toHaveBeenCalledWith(7, {
      entryType: 'assessment',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      limit: 500,
    });
  });

  it('shows the skeleton, not a number, while the ledger is loading', () => {
    useLedgerMock.mockReturnValue(loading());

    render(<FinanceKpiRow communityId={7} />);

    expect(screen.queryByText('Billed This Month')).not.toBeInTheDocument();
  });
});

describe('FinanceKpiRow — Collected This Month', () => {
  it('sums payments whose paidAt falls in the current month, late fees included', () => {
    useRecentPaymentsMock.mockReturnValue(
      loaded([
        { id: 1, unitId: 1, amountCents: 48500, lateFeeCents: 2500, dueDate: '2026-09-01', paidAt: '2026-09-03T14:00:00.000Z' },
        { id: 2, unitId: 2, amountCents: 48500, lateFeeCents: 0, dueDate: '2026-09-01', paidAt: '2026-09-20T09:30:00.000Z' },
        // Last month — excluded.
        { id: 3, unitId: 3, amountCents: 48500, lateFeeCents: 0, dueDate: '2026-08-01', paidAt: '2026-08-28T09:30:00.000Z' },
        // Paid but undated — cannot be placed in a month, excluded.
        { id: 4, unitId: 4, amountCents: 48500, lateFeeCents: 0, dueDate: '2026-09-01', paidAt: null },
      ]),
    );

    // delinquencyEnabled so the other two cards render numbers, leaving NO
    // legitimate "--" on screen: any "--" left is the hardcoded one.
    render(<FinanceKpiRow communityId={7} delinquencyEnabled />);

    expect(screen.getByText('Collected This Month')).toBeInTheDocument();
    expect(screen.getByText('$995')).toBeInTheDocument();
    expect(screen.queryByText('--')).not.toBeInTheDocument();
  });

  it('shows the skeleton while payment history is loading', () => {
    useRecentPaymentsMock.mockReturnValue(loading());

    render(<FinanceKpiRow communityId={7} />);

    expect(screen.queryByText('Collected This Month')).not.toBeInTheDocument();
  });
});
