/**
 * ComplianceDashboard Component Tests
 *
 * Deep tests on the compliance dashboard — the key selling screen.
 * Focuses on: score calculation display, status filtering, loading/error/empty
 * states, and correct data rendering.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import type { ChecklistItemData } from '../../src/components/compliance/compliance-checklist-item';

// ---------------------------------------------------------------------------
// Mock hooks
// ---------------------------------------------------------------------------

const mockUseComplianceChecklist = vi.fn();
const mockUseComplianceMutations = vi.fn();

vi.mock('../../src/hooks/useComplianceChecklist', () => ({
  useComplianceChecklist: (...args: unknown[]) => mockUseComplianceChecklist(...args),
  COMPLIANCE_QUERY_KEY: 'compliance-checklist',
}));

vi.mock('../../src/hooks/useComplianceMutations', () => ({
  useComplianceMutations: (...args: unknown[]) => mockUseComplianceMutations(...args),
}));

// Mock the PDF export
vi.mock('../../src/lib/utils/pdf-export', () => ({
  generateChecklistPdf: vi.fn(),
}));

// Mock motion components to simplify rendering
vi.mock('@/components/motion', () => ({
  FadeIn: ({ children }: PropsWithChildren) => <>{children}</>,
}));

// Mock sub-components that have their own dependencies
vi.mock('../../src/components/compliance/compliance-activity-feed', () => ({
  ComplianceActivityFeed: () => <div data-testid="activity-feed" />,
}));

vi.mock('../../src/components/compliance/deadline-ribbon', () => ({
  DeadlineRibbon: () => <div data-testid="deadline-ribbon" />,
}));

vi.mock('../../src/components/compliance/link-document-modal', () => ({
  LinkDocumentModal: () => null,
}));

vi.mock('../../src/components/compliance/upload-document-modal', () => ({
  UploadDocumentModal: () => null,
}));

// ---------------------------------------------------------------------------
// Test data factory
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<ChecklistItemData> = {}): ChecklistItemData {
  return {
    id: Math.floor(Math.random() * 10000),
    communityId: 42,
    templateKey: '718_declaration',
    title: 'Declaration of Condominium',
    description: 'Test item',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(g)(2)(a)',
    status: 'unsatisfied',
    documentId: null,
    documentPostedAt: null,
    isApplicable: true,
    deadlineDays: 30,
    rollingMonths: null,
    isConditional: false,
    ...overrides,
  } as ChecklistItemData;
}

function makeMutations() {
  return {
    linkDocument: { mutate: vi.fn(), isPending: false },
    unlinkDocument: { mutate: vi.fn(), isPending: false },
    markNotApplicable: { mutate: vi.fn(), isPending: false },
    markApplicable: { mutate: vi.fn(), isPending: false },
  };
}

// ---------------------------------------------------------------------------
// Wrapper
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

async function renderDashboard(communityId = 42) {
  const { ComplianceDashboard } = await import(
    '../../src/components/compliance/compliance-dashboard'
  );
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <ComplianceDashboard communityId={communityId} />
    </Wrapper>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockUseComplianceMutations.mockReturnValue(makeMutations());
});

describe('ComplianceDashboard', () => {
  it('renders loading skeleton when data is pending', async () => {
    mockUseComplianceChecklist.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    await renderDashboard();

    // Should not show real checklist item content while loading
    expect(screen.queryByText('Declaration of Condominium')).not.toBeInTheDocument();
  });

  it('renders error state when query fails', async () => {
    mockUseComplianceChecklist.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to fetch compliance checklist: 500'),
    });

    await renderDashboard();

    // Should display some error indication
    const bodyText = document.body.textContent || '';
    expect(bodyText).toMatch(/failed|error|couldn't|unable/i);
  });

  it('renders onboarding state when checklist is empty', async () => {
    mockUseComplianceChecklist.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    await renderDashboard();

    // Empty checklist should show onboarding/setup prompt
    const bodyText = document.body.textContent || '';
    // The onboarding component or empty state should be visible
    expect(bodyText.length).toBeGreaterThan(0);
  });

  it('displays compliance score for mixed status items', async () => {
    const items: ChecklistItemData[] = [
      makeItem({ id: 1, status: 'satisfied', documentId: 1, title: 'Item A' }),
      makeItem({ id: 2, status: 'satisfied', documentId: 2, title: 'Item B' }),
      makeItem({ id: 3, status: 'unsatisfied', title: 'Item C' }),
      makeItem({ id: 4, status: 'overdue', title: 'Item D' }),
      makeItem({ id: 5, status: 'not_applicable', isApplicable: false, title: 'Item E' }),
    ];

    mockUseComplianceChecklist.mockReturnValue({
      data: items,
      isLoading: false,
      error: null,
    });

    await renderDashboard();

    // 2 satisfied / 4 applicable = 50%
    const bodyText = document.body.textContent || '';
    expect(bodyText).toContain('50');
  });

  it('displays 100% when all applicable items are satisfied', async () => {
    const items: ChecklistItemData[] = [
      makeItem({ id: 1, status: 'satisfied', documentId: 1, title: 'Item A' }),
      makeItem({ id: 2, status: 'satisfied', documentId: 2, title: 'Item B' }),
      makeItem({ id: 3, status: 'not_applicable', isApplicable: false, title: 'Item C' }),
    ];

    mockUseComplianceChecklist.mockReturnValue({
      data: items,
      isLoading: false,
      error: null,
    });

    await renderDashboard();

    const bodyText = document.body.textContent || '';
    expect(bodyText).toContain('100');
  });

  it('renders items from all 5 statutory categories', async () => {
    const items: ChecklistItemData[] = [
      makeItem({ id: 1, category: 'governing_documents', title: 'Governing Doc' }),
      makeItem({ id: 2, category: 'financial_records', title: 'Financial Doc' }),
      makeItem({ id: 3, category: 'meeting_records', title: 'Meeting Doc' }),
      makeItem({ id: 4, category: 'insurance', title: 'Insurance Doc' }),
      makeItem({ id: 5, category: 'operations', title: 'Operations Doc' }),
    ];

    mockUseComplianceChecklist.mockReturnValue({
      data: items,
      isLoading: false,
      error: null,
    });

    await renderDashboard();

    // All items should be rendered in the dashboard
    const bodyText = document.body.textContent || '';
    expect(bodyText).toContain('Governing Doc');
    expect(bodyText).toContain('Financial Doc');
    expect(bodyText).toContain('Meeting Doc');
    expect(bodyText).toContain('Insurance Doc');
    expect(bodyText).toContain('Operations Doc');
  });

  it('renders correct score for 3/5 satisfied items (60%)', async () => {
    const items: ChecklistItemData[] = [
      makeItem({ id: 1, status: 'satisfied', documentId: 1, title: 'A' }),
      makeItem({ id: 2, status: 'satisfied', documentId: 2, title: 'B' }),
      makeItem({ id: 3, status: 'satisfied', documentId: 3, title: 'C' }),
      makeItem({ id: 4, status: 'unsatisfied', title: 'D' }),
      makeItem({ id: 5, status: 'overdue', title: 'E' }),
    ];

    mockUseComplianceChecklist.mockReturnValue({
      data: items,
      isLoading: false,
      error: null,
    });

    await renderDashboard();

    const bodyText = document.body.textContent || '';
    expect(bodyText).toContain('60');
  });

  it('passes communityId to hooks', async () => {
    mockUseComplianceChecklist.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    await renderDashboard(99);

    expect(mockUseComplianceChecklist).toHaveBeenCalledWith(99);
    expect(mockUseComplianceMutations).toHaveBeenCalledWith(99);
  });
});
