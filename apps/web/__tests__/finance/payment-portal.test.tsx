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

function mockBothFetches(
  statementData: Record<string, unknown> | null,
  options: { error?: boolean; mode?: 'unit' | 'community' } = {},
) {
  const { error = false, mode } = options;
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
      // As of B1 Slice 3, the canonical envelope is
      // `{ data: { mode, statement } }`. The legacy `{ data }` (no mode
      // wrapper) is still tolerated by `usePaymentStatement` for back-compat,
      // so the `mode === undefined` branch keeps the old single-wrap shape
      // to exercise that fallback.
      const body = mode
        ? { data: { mode, statement: statementData } }
        : { data: statementData };
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(body),
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
          paymentsEnabled={false}
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
          paymentsEnabled={false}
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
          paymentsEnabled={false}
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
          paymentsEnabled={false}
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
          paymentsEnabled={false}
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
          paymentsEnabled={false}
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
          paymentsEnabled={false}
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

  describe('community mode (staff)', () => {
    it('renders a Unit column in upcoming + history tables', async () => {
      mockBothFetches(
        {
          balanceCents: 90000,
          ledgerEntries: [],
          lineItems: [
            {
              id: 501,
              assessmentId: 11,
              unitId: 101,
              unitNumber: '101',
              amountCents: 40000,
              lateFeeCents: 0,
              status: 'pending',
              dueDate: '2026-05-01',
              paidAt: null,
              paymentIntentId: null,
            },
            {
              id: 502,
              assessmentId: 12,
              unitId: 202,
              unitNumber: '202',
              amountCents: 50000,
              lateFeeCents: 0,
              status: 'overdue',
              dueDate: '2026-04-01',
              paidAt: null,
              paymentIntentId: null,
            },
          ],
        },
        { mode: 'community' },
      );

      const PaymentPortal = await importPaymentPortal();
      const { Wrapper } = createWrapper();

      render(
        <Wrapper>
          <PaymentPortal communityId={42} userRole="pm_admin" mode="community" paymentsEnabled={false} />
        </Wrapper>,
      );

      await waitFor(() => {
        expect(screen.getByRole('columnheader', { name: /unit/i })).toBeInTheDocument();
      });

      /*
       * The whole header row, in order — not just "a Unit column exists".
       * Asserting one header cannot see a column being added, removed or
       * reordered around it, and `Unit` leading is the part that matters: it is
       * the only column whose presence is conditional in community mode.
       */
      expect(
        screen.getAllByRole('columnheader').map((cell) => cell.textContent),
      ).toEqual(['Unit', 'Due Date', 'Status', 'Amount', 'Late Fee', 'Total']);

      expect(screen.getByText('Unit 101')).toBeInTheDocument();
      expect(screen.getByText('Unit 202')).toBeInTheDocument();
    });

    it('hides Pay Now in community mode EVEN WHEN payments are enabled', async () => {
      /*
       * `paymentsEnabled` is deliberately TRUE here, and must not be "tidied" to
       * false to match its siblings.
       *
       * `canPay = mode === 'unit' && paymentsEnabled` is a conjunction. With
       * both terms false this case was satisfied by either one, so it passed
       * even if the `mode === 'unit' &&` term were DELETED outright — it proved
       * nothing about the branch it is named for. Enabling payments makes
       * `mode` the sole false term, so the assertion now tests the community
       * gate and only the community gate.
       */
      mockBothFetches(
        {
          balanceCents: 40000,
          ledgerEntries: [],
          lineItems: [
            {
              id: 701,
              assessmentId: 21,
              unitId: 303,
              unitNumber: '303',
              amountCents: 40000,
              lateFeeCents: 0,
              status: 'pending',
              dueDate: '2026-05-01',
              paidAt: null,
              paymentIntentId: null,
            },
          ],
        },
        { mode: 'community' },
      );

      const PaymentPortal = await importPaymentPortal();
      const { Wrapper } = createWrapper();

      render(
        <Wrapper>
          <PaymentPortal communityId={42} userRole="cam" mode="community" paymentsEnabled />
        </Wrapper>,
      );

      // Wait for the community balance to render so we know the data is mounted.
      await waitFor(() => {
        expect(screen.getByText(/community balance/i)).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /pay now/i })).not.toBeInTheDocument();
    });

    it('renders empty-state card when the community has no activity', async () => {
      mockBothFetches(
        {
          balanceCents: 0,
          ledgerEntries: [],
          lineItems: [],
        },
        { mode: 'community' },
      );

      const PaymentPortal = await importPaymentPortal();
      const { Wrapper } = createWrapper();

      render(
        <Wrapper>
          <PaymentPortal communityId={42} userRole="pm_admin" mode="community" paymentsEnabled={false} />
        </Wrapper>,
      );

      // The payload has no line items but is non-null — empty line items render
      // the "All caught up" tab-content fallback; confirm it is not the
      // literal `null` blank-page that used to happen for `!data`.
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        expect(bodyText.length).toBeGreaterThan(0);
      });
      // Explicit empty line-item copy still shows — we are NOT returning null.
      expect(screen.queryByText(/all caught up/i)).toBeInTheDocument();
    });

    it('renders empty-state card (not blank page) when data is null', async () => {
      // Backwards-compat: server returns `{ data: null }` — old behaviour was
      // `return null` which produced a blank page. New behaviour: empty-state.
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('fee-policy')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: { feePolicy: 'owner_pays' } }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { mode: 'community', statement: null } }),
        });
      });

      const PaymentPortal = await importPaymentPortal();
      const { Wrapper } = createWrapper();

      render(
        <Wrapper>
          <PaymentPortal communityId={42} userRole="pm_admin" mode="community" paymentsEnabled={false} />
        </Wrapper>,
      );

      await waitFor(() => {
        expect(screen.getByText(/no payment activity yet for this community/i)).toBeInTheDocument();
      });
    });
  });

  describe('unit mode — regressions', () => {
    it('keeps the multi-unit resident picker behaviour', async () => {
      const PaymentPortal = await importPaymentPortal();
      const { Wrapper } = createWrapper();

      render(
        <Wrapper>
          <PaymentPortal
            communityId={42}
            userRole="resident"
            paymentsEnabled={false}
            mode="unit"
            actorUnits={[
              { id: 101, label: 'Unit 101' },
              { id: 202, label: 'Unit 202' },
            ]}
            requiresExplicitUnitSelection={true}
          />
        </Wrapper>,
      );

      expect(screen.getByText(/select a unit to continue/i)).toBeInTheDocument();
      // The fetch should be suppressed while the picker is shown.
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/payments/statement?'),
      );
    });

    it('parses new `{ mode: "unit", data }` envelope transparently', async () => {
      mockBothFetches(
        {
          unitId: 303,
          balanceCents: 35000,
          ledgerEntries: [],
          /*
           * A REAL row, deliberately. With `lineItems: []` the table never
           * renders at all, so the "no Unit column" assertion below was
           * vacuously true — it would have passed even if `showUnitColumn`
           * were inverted. A row forces the header to render so the negative
           * is about the column, not about the table's existence.
           */
          lineItems: [
            {
              id: 91,
              assessmentTitle: 'Monthly Maintenance',
              amountCents: 35000,
              lateFeeCents: 0,
              status: 'pending',
              dueDate: '2026-05-01',
              paidAt: null,
            },
          ],
        },
        { mode: 'unit' },
      );

      const PaymentPortal = await importPaymentPortal();
      const { Wrapper } = createWrapper();

      render(
        <Wrapper>
          <PaymentPortal communityId={42} userRole="resident" mode="unit" unitId={303} paymentsEnabled={false} />
        </Wrapper>,
      );

      await waitFor(() => {
        expect(screen.getByText(/current balance/i)).toBeInTheDocument();
      });
      // The table is really on screen — otherwise the negative below is free.
      expect(screen.getByRole('columnheader', { name: /due date/i })).toBeInTheDocument();
      // …and it has no Unit column, because this is unit mode.
      expect(screen.queryByRole('columnheader', { name: /unit/i })).not.toBeInTheDocument();
    });
  });

  /*
   * The payments gate itself — `canPay = mode === 'unit' && paymentsEnabled`.
   *
   * Every case above passes `paymentsEnabled={false}`, which is honest (it is
   * the launch default for every community, per the F-15 legal gate) but left
   * the ENABLED render path covered by nothing at all. The two branches it
   * controls are the `Action` column header and the per-row `Pay Now` button.
   *
   * Nothing here changes production posture: `assessmentPaymentsEnabled` is
   * per-community DB state written only by the platform-admin console. This
   * puts the render path under test, not the feature into production.
   */
  describe('the payments gate', () => {
    const unpaidStatement = {
      lineItems: [
        {
          id: 11,
          assessmentTitle: 'Monthly Maintenance',
          amountCents: 40000,
          lateFeeCents: 0,
          status: 'pending',
          dueDate: '2026-05-01',
          paidAt: null,
        },
      ],
      paymentHistory: [],
      unitLabel: 'Unit 301',
    };

    it('renders the Pay Now action when payments are enabled', async () => {
      mockBothFetches(unpaidStatement);

      const PaymentPortal = await importPaymentPortal();
      const { Wrapper } = createWrapper();

      render(
        <Wrapper>
          <PaymentPortal communityId={42} userRole="owner" paymentsEnabled />
        </Wrapper>,
      );

      // Presence, not a click: clicking mounts PaymentDialog, which imports
      // `loadStripe` and injects a real script tag under jsdom.
      expect(await screen.findByRole('button', { name: /pay now/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /action/i })).toBeInTheDocument();
    });

    it('hides Pay Now when payments are disabled WITHOUT hiding the balance', async () => {
      /*
       * The F-15 contract, stated in the component's own docblock and asserted
       * by nothing until now: "the balance and history stay fully visible and
       * only the CHARGE affordance disappears — a resident must still be able to
       * see what they owe and how it was computed."
       *
       * Half of this case is therefore a NEGATIVE and half a POSITIVE. A test
       * that only checked the negative would pass just as happily against a
       * component that rendered nothing at all.
       */
      mockBothFetches(unpaidStatement);

      const PaymentPortal = await importPaymentPortal();
      const { Wrapper } = createWrapper();

      render(
        <Wrapper>
          <PaymentPortal communityId={42} userRole="owner" paymentsEnabled={false} />
        </Wrapper>,
      );

      await waitFor(() => {
        expect(screen.getByText(/current balance/i)).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /pay now/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: /action/i })).not.toBeInTheDocument();

      /*
       * …and what the resident owes is still on screen. The row renders the
       * amount and the total, not the assessment title, so $400.00 appears
       * twice — getAllByText, not getByText.
       */
      expect(screen.getAllByText(/\$400\.00/).length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: /payment history/i })).toBeInTheDocument();
    });
  });
});
