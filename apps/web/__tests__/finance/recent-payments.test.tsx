/**
 * RecentPayments — extracted verbatim from finance-dashboard.tsx so the flat
 * Payments switcher can place it on the Overview view. The prototype
 * (pp-money.js) puts recent payments on the overview rather than behind a tab
 * of their own.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useRecentPaymentsMock = vi.fn();

vi.mock('@/hooks/use-finance', () => ({
  useRecentPayments: (...args: unknown[]) => useRecentPaymentsMock(...args),
}));

import { RecentPayments } from '@/components/finance/recent-payments';

beforeEach(() => {
  useRecentPaymentsMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('RecentPayments', () => {
  it('shows a placeholder while loading', () => {
    useRecentPaymentsMock.mockReturnValue({ data: undefined, isLoading: true });

    const { container } = render(<RecentPayments communityId={3} />);

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(useRecentPaymentsMock).toHaveBeenCalledWith(3);
  });

  it('shows the empty state when nothing has been paid', () => {
    useRecentPaymentsMock.mockReturnValue({ data: [], isLoading: false });

    render(<RecentPayments communityId={3} />);

    expect(screen.getByText('No payments received yet.')).toBeInTheDocument();
  });

  it('lists paid rows with amount, late fee, and a dash where a value is absent', () => {
    useRecentPaymentsMock.mockReturnValue({
      data: [
        { id: 1, unitId: 12, amountCents: 48500, lateFeeCents: 2500, dueDate: '2026-09-01', paidAt: '2026-09-03T14:00:00.000Z' },
        { id: 2, unitId: 7, amountCents: 48500, lateFeeCents: 0, dueDate: '2026-09-01', paidAt: null },
      ],
      isLoading: false,
    });

    render(<RecentPayments communityId={3} />);

    expect(screen.getByText('Unit #12')).toBeInTheDocument();
    expect(screen.getByText('Unit #7')).toBeInTheDocument();
    expect(screen.getAllByText('$485.00')).toHaveLength(2);
    expect(screen.getByText('$25.00')).toBeInTheDocument();
    // Row 2: no paidAt and no late fee — one dash for each.
    expect(screen.getAllByText('-')).toHaveLength(2);
  });
});
