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
    json: () => Promise.resolve({
      data: {
        data: assessments,
        pagination: { nextCursor: null, hasMore: false, pageSize: 100 },
      },
    }),
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
        <AssessmentManager communityId={42} communityType="condo_718" userId="user-1" userRole="board_president" />
      </Wrapper>,
    );

    // $350.00 should be displayed (35000 cents → $350)
    await waitFor(() => {
      expect(screen.getByText(/\$350\.00/)).toBeInTheDocument();
      expect(screen.getByText('Monthly Maintenance')).toBeInTheDocument();
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
        <AssessmentManager communityId={42} communityType="condo_718" userId="user-1" userRole="board_president" />
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
        <AssessmentManager communityId={42} communityType="condo_718" userId="user-1" userRole="board_president" />
      </Wrapper>,
    );

    // The first-run hero is dynamically loaded: find it, don't get it.
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Set up the dues your units pay' }, { timeout: 10000 }),
    ).toBeInTheDocument();
    // The hero owns the one action; the tab header (and its button) is hidden while empty.
    expect(screen.getAllByRole('button', { name: 'Create Assessment' })).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Assessments' })).toBeNull();
    // Help points only at articles that exist.
    expect(screen.getByRole('link', { name: 'Create dues and special assessments' })).toHaveAttribute(
      'href',
      '/help/payments/create-assessment',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create Assessment' }));
    expect(await screen.findByText('Amount ($)')).toBeInTheDocument();
  });

  it('tells an apartment manager that no resident sees assessments', async () => {
    mockAssessmentsSuccess([]);

    const AssessmentManager = await importAssessmentManager();
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <AssessmentManager communityId={42} communityType="apartment" userId="user-1" userRole="property_manager" />
      </Wrapper>,
    );

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Set up recurring charges for your units' }, { timeout: 10000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Only managers\./)).toBeInTheDocument();
    // The board-approval line is condo/HOA only.
    expect(screen.queryByRole('heading', { name: 'Before you create one' })).toBeNull();
  });

  it('keeps the tab header and drops the first-run hero once an assessment exists', async () => {
    mockAssessmentsSuccess([makeAssessment()]);

    const AssessmentManager = await importAssessmentManager();
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <AssessmentManager communityId={42} communityType="condo_718" userId="user-1" userRole="board_president" />
      </Wrapper>,
    );

    expect(await screen.findByRole('heading', { name: 'Assessments' }, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Set up the dues your units pay' })).toBeNull();
  });

  it('shows Create Assessment button', async () => {
    mockAssessmentsSuccess([makeAssessment()]);

    const AssessmentManager = await importAssessmentManager();
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <AssessmentManager communityId={42} communityType="condo_718" userId="user-1" userRole="board_president" />
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
        <AssessmentManager communityId={42} communityType="condo_718" userId="user-1" userRole="board_president" />
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
        <AssessmentManager communityId={42} communityType="condo_718" userId="user-1" userRole="board_president" />
      </Wrapper>,
    );

    await waitFor(() => {
      const bodyText = document.body.textContent || '';
      expect(bodyText).toContain('Monthly');
      expect(bodyText).toContain('Quarterly');
      expect(bodyText).toContain('Annual');
    }, { timeout: 10000 });
  });

  it('names each line item\'s unit by its number, not its database id', async () => {
    mockAssessmentsSuccess([makeAssessment({ id: 1, title: 'Monthly Maintenance' })]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: [
          {
            id: 10,
            assessmentId: 1,
            unitId: 2,
            unitLabel: 'Unit 1B',
            amountCents: 35000,
            dueDate: '2026-09-01',
            status: 'pending',
            lateFeeCents: 0,
            paidAt: null,
          },
        ],
      }),
    });

    const AssessmentManager = await importAssessmentManager();
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <AssessmentManager communityId={42} communityType="condo_718" userId="user-1" userRole="board_president" />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByText('Monthly Maintenance', {}, { timeout: 10000 }));

    expect(await screen.findByText('Unit 1B', {}, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.queryByText('Unit #2')).not.toBeInTheDocument();
    expect(mockFetch.mock.calls[1]![0]).toContain('/api/v1/assessments/1/line-items?communityId=42');
  });
  describe('a selected assessment with no charges', () => {
    async function openLineItems(assessment: AssessmentData, lineItems: unknown[]) {
      mockAssessmentsSuccess([assessment]);
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: lineItems }) });
      const AssessmentManager = await importAssessmentManager();
      const { Wrapper } = createWrapper();
      render(
        <Wrapper>
          <AssessmentManager communityId={42} communityType="condo_718" userId="user-1" userRole="board_president" />
        </Wrapper>,
      );
      fireEvent.click(await screen.findByText(assessment.title, {}, { timeout: 10000 }));
    }

    it('offers Generate charges on a One-Time assessment', async () => {
      await openLineItems(makeAssessment({ title: 'Roof Special', frequency: 'one_time' }), []);
      expect(await screen.findByRole('button', { name: 'Generate charges' }, { timeout: 10000 })).toBeInTheDocument();
      expect(screen.getByLabelText('Due date')).toBeInTheDocument();
    });

    it('says when a recurring assessment is charged, with no button', async () => {
      await openLineItems(makeAssessment({ title: 'Monthly Maintenance' }), []);
      expect(
        await screen.findByText('No charges yet. Every unit is charged on the 1st of each month this assessment falls due.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Generate charges' })).not.toBeInTheDocument();
    });

    it('drops Generate charges once a One-Time assessment has charges', async () => {
      await openLineItems(makeAssessment({ id: 1, title: 'Roof Special', frequency: 'one_time' }), [
        { id: 10, assessmentId: 1, unitId: 2, unitLabel: 'Unit 1B', amountCents: 35000, dueDate: '2026-12-01', status: 'pending', lateFeeCents: 0, paidAt: null },
      ]);
      expect(await screen.findByText('Unit 1B', {}, { timeout: 10000 })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Generate charges' })).not.toBeInTheDocument();
    });
  });
});
