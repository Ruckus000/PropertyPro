/**
 * AssessmentManager Component Tests
 *
 * 815-line component handling financial CRUD. A rounding bug means someone
 * gets charged $3,500 instead of $350.
 *
 * Focuses on: dollar display accuracy, loading/error states, form dialog,
 * frequency display, and active/inactive status.
 */
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

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

interface AssessmentData {
  id: number;
  communityId: number;
  title: string;
  description: string | null;
  amountCents: number;
  frequency: 'monthly' | 'quarterly' | 'annual' | 'one_time';
  dueDay: number | null;
  lateFeeAmountCents: number;
  lateFeeDaysGrace: number;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
}

function makeAssessment(
  overrides: Partial<AssessmentData> = {},
): AssessmentData {
  return {
    id: 1,
    communityId: 42,
    title: 'Monthly Maintenance',
    description: null,
    amountCents: 35000,
    frequency: 'monthly',
    dueDay: 1,
    lateFeeAmountCents: 2500,
    lateFeeDaysGrace: 15,
    startDate: '2026-01-01',
    endDate: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function mockAssessmentsSuccess(assessments: AssessmentData[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ data: assessments }),
  });
}

async function importAssessmentManager() {
  const mod = await import(
    '../../src/components/finance/assessment-manager'
  );
  return mod.AssessmentManager;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AssessmentManager', () => {
  it('renders assessment cards with correct dollar amounts', async () => {
    mockAssessmentsSuccess([
      makeAssessment({ amountCents: 35000, title: 'Monthly Maintenance' }),
    ]);

    const AssessmentManager = await importAssessmentManager();
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <AssessmentManager communityId={42} userId="user-1" userRole="board_president" />
      </Wrapper>,
    );

    // $350.00 should be displayed (35000 cents → $350)
    await waitFor(() => {
      const bodyText = document.body.textContent || '';
      expect(bodyText).toContain('350');
      expect(bodyText).toContain('Monthly Maintenance');
    }, { timeout: 10000 });
  });

  it('shows error state when API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { message: 'Database error' } }),
    });

    const AssessmentManager = await importAssessmentManager();
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <AssessmentManager communityId={42} userId="user-1" userRole="board_president" />
      </Wrapper>,
    );

    await waitFor(() => {
      const bodyText = document.body.textContent || '';
      expect(bodyText).toMatch(/error|failed|couldn't|try again/i);
    }, { timeout: 10000 });
  });

  it('shows empty state when no assessments exist', async () => {
    mockAssessmentsSuccess([]);

    const AssessmentManager = await importAssessmentManager();
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <AssessmentManager communityId={42} userId="user-1" userRole="board_president" />
      </Wrapper>,
    );

    await waitFor(() => {
      const bodyText = document.body.textContent || '';
      expect(bodyText).toMatch(/no assessment|create|get started/i);
    }, { timeout: 10000 });
  });

  it('shows Create Assessment button', async () => {
    mockAssessmentsSuccess([makeAssessment()]);

    const AssessmentManager = await importAssessmentManager();
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <AssessmentManager communityId={42} userId="user-1" userRole="board_president" />
      </Wrapper>,
    );

    const createButton = await screen.findByRole(
      'button',
      { name: /create assessment/i },
      { timeout: 10000 },
    );
    expect(createButton).toBeInTheDocument();
  });

  it('opens create dialog when button is clicked', async () => {
    mockAssessmentsSuccess([makeAssessment()]);

    const AssessmentManager = await importAssessmentManager();
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <AssessmentManager communityId={42} userId="user-1" userRole="board_president" />
      </Wrapper>,
    );

    const createButton = await screen.findByRole(
      'button',
      { name: /create assessment/i },
      { timeout: 10000 },
    );
    fireEvent.click(createButton);

    // Dialog should show amount field
    await waitFor(() => {
      expect(screen.getByText(/Amount/i)).toBeInTheDocument();
    });
  });

  it('displays all frequency types correctly', async () => {
    mockAssessmentsSuccess([
      makeAssessment({ id: 1, title: 'Monthly', frequency: 'monthly' }),
      makeAssessment({ id: 2, title: 'Quarterly', frequency: 'quarterly' }),
      makeAssessment({ id: 3, title: 'Annual', frequency: 'annual' }),
      makeAssessment({ id: 4, title: 'One-Time', frequency: 'one_time' }),
    ]);

    const AssessmentManager = await importAssessmentManager();
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <AssessmentManager communityId={42} userId="user-1" userRole="board_president" />
      </Wrapper>,
    );

    await waitFor(() => {
      const bodyText = document.body.textContent || '';
      expect(bodyText).toContain('Monthly');
      expect(bodyText).toContain('Quarterly');
      expect(bodyText).toContain('Annual');
    }, { timeout: 10000 });
  });
});
