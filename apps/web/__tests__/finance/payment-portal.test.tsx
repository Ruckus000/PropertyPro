/**
 * PaymentPortal Component Tests
 *
 * The payment portal is where board treasurers see their financial obligations.
 * Focuses on: money display accuracy, loading/error states, and empty state.
 */
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);
const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/communities/42/payments',
  useSearchParams: () => new URLSearchParams('communityId=42'),
}));

// Mock format-date utility
vi.mock('@/lib/utils/format-date', () => ({
  formatDateOnly: (d: string) => d,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    Wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

function mockBothFetches(statementData: Record<string, unknown> | null, error = false) {
  if (error) {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { message: 'Server error' } }),
    });
  } else {
    // First call is statement, second is fee-policy
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('fee-policy')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { feePolicy: 'owner_pays' } }),
        });
      }
      if (statementData === null) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: statementData }),
      });
    });
  }
}

async function importPaymentPortal() {
  const mod = await import('../../src/components/finance/payment-portal');
  return mod.PaymentPortal;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('open', vi.fn());
});

describe('PaymentPortal', () => {
  it('renders without crashing with valid props', async () => {
    mockBothFetches({
      lineItems: [],
      paymentHistory: [],
      unitLabel: 'Unit 301',
    });

    const PaymentPortal = await importPaymentPortal();
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <PaymentPortal
          communityId={42}
          userRole="owner"
        />
      </Wrapper>,
    );

    // Should render the component (either loading or content)
    await waitFor(() => {
      const bodyText = document.body.textContent || '';
      expect(bodyText.length).toBeGreaterThan(0);
    });
  });

  it('shows error state when statement API fails', async () => {
    mockBothFetches(null);

    const PaymentPortal = await importPaymentPortal();
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <PaymentPortal
          communityId={42}
          userRole="owner"
        />
      </Wrapper>,
    );

    await waitFor(() => {
      const bodyText = document.body.textContent || '';
      expect(bodyText).toMatch(/failed|error|couldn't|unable|try again/i);
    }, { timeout: 10000 });
  });

  it('calculates total due from pending and overdue items', async () => {
    mockBothFetches({
      lineItems: [
        {
          id: 1,
          assessmentTitle: 'Monthly Maintenance',
          amountCents: 35000,
          lateFeeCents: 0,
          status: 'pending',
          dueDate: '2026-04-01',
          paidAt: null,
        },
        {
          id: 2,
          assessmentTitle: 'Special Assessment',
          amountCents: 50000,
          lateFeeCents: 2500,
          status: 'overdue',
          dueDate: '2026-02-01',
          paidAt: null,
        },
        {
          id: 3,
          assessmentTitle: 'January',
          amountCents: 35000,
          lateFeeCents: 0,
          status: 'paid',
          dueDate: '2026-01-01',
          paidAt: '2025-12-28',
        },
      ],
      paymentHistory: [],
      unitLabel: 'Unit 301',
    });

    const PaymentPortal = await importPaymentPortal();
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <PaymentPortal
          communityId={42}
          userRole="owner"
        />
      </Wrapper>,
    );

    // Total due = $350 + $500 + $25 late fee = $875 (paid items excluded)
    await waitFor(() => {
      const bodyText = document.body.textContent || '';
      expect(bodyText).toContain('875');
    }, { timeout: 10000 });
  });

  it('treats partially paid items as outstanding in upcoming totals', async () => {
    mockBothFetches({
      unitId: 301,
      balanceCents: 42500,
      ledgerEntries: [],
      lineItems: [
        {
          id: 10,
          assessmentId: 1001,
          unitId: 301,
          amountCents: 40000,
          lateFeeCents: 2500,
          status: 'partially_paid',
          dueDate: '2026-03-01',
          paidAt: null,
          paymentIntentId: null,
        },
        {
          id: 11,
          assessmentId: 1002,
          unitId: 301,
          amountCents: 35000,
          lateFeeCents: 0,
          status: 'paid',
          dueDate: '2026-02-01',
          paidAt: '2026-02-03',
          paymentIntentId: 'pi_123',
        },
      ],
    });

    const PaymentPortal = await importPaymentPortal();
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <PaymentPortal
          communityId={42}
          userRole="owner"
        />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/partially paid/i)).toBeInTheDocument();
      // Total due should include partially_paid row (400 + 25) and exclude paid rows.
      const bodyText = document.body.textContent || '';
      expect(bodyText).toContain('$425.00');
    }, { timeout: 10000 });
  });

  it('handles empty line items gracefully', async () => {
    mockBothFetches({
      lineItems: [],
      paymentHistory: [],
      unitLabel: 'Unit 301',
    });

    const PaymentPortal = await importPaymentPortal();
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <PaymentPortal
          communityId={42}
          userRole="owner"
        />
      </Wrapper>,
    );

    // Should render $0 or "no assessments" without crashing
    await waitFor(() => {
      const bodyText = document.body.textContent || '';
      expect(bodyText).toMatch(/\$0|no.*assessment|up to date|0\.00/i);
    }, { timeout: 10000 });
  });

  it('requires explicit unit selection for multi-unit users before loading data', async () => {
    const PaymentPortal = await importPaymentPortal();
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <PaymentPortal
          communityId={42}
          userRole="resident"
          actorUnits={[
            { id: 101, label: 'Unit 101' },
            { id: 202, label: 'Unit 202' },
          ]}
          requiresExplicitUnitSelection={true}
        />
      </Wrapper>,
    );

    expect(screen.getByText(/select a unit to continue/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/payments/statement?'),
    );
  });

  it('passes selected unitId into statement fetch and export', async () => {
    mockBothFetches({
      unitId: 202,
      balanceCents: 0,
      ledgerEntries: [],
      lineItems: [],
    });

    const PaymentPortal = await importPaymentPortal();
    const { Wrapper } = createWrapper();
    const user = userEvent.setup();

    render(
      <Wrapper>
        <PaymentPortal
          communityId={42}
          userRole="resident"
          unitId={202}
          actorUnits={[
            { id: 101, label: 'Unit 101' },
            { id: 202, label: 'Unit 202' },
          ]}
        />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/payments/statement?communityId=42&unitId=202'),
      );
    });

    const downloadButton = await screen.findByRole('button', { name: /download pdf/i });
    await user.click(downloadButton);
    expect(window.open).toHaveBeenCalledWith(
      '/api/v1/finance/export/statement?communityId=42&unitId=202',
      '_blank',
    );
  });
});
