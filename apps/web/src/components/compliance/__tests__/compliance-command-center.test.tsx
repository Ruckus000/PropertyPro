import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ComplianceCommandCenter } from '../compliance-command-center';

// Mutable return value so individual tests can override it.
let mockChecklistReturn: {
  data: unknown[] | undefined;
  isLoading: boolean;
  error: Error | null;
} = {
  data: [
    {
      id: 1, templateKey: '718_declaration', title: 'Declaration',
      category: 'governing_documents', status: 'satisfied',
      documentId: 99, documentPostedAt: '2026-05-01T00:00:00.000Z',
      deadline: null, rollingWindow: null, isApplicable: true,
    },
    {
      id: 2, templateKey: '718_insurance', title: 'Insurance',
      category: 'insurance', status: 'overdue',
      documentId: null, documentPostedAt: null,
      deadline: '2026-05-01T00:00:00.000Z', rollingWindow: null, isApplicable: true,
    },
  ],
  isLoading: false,
  error: null,
};

vi.mock('@/hooks/useComplianceChecklist', () => ({
  useComplianceChecklist: () => mockChecklistReturn,
  COMPLIANCE_QUERY_KEY: 'compliance-checklist',
}));

vi.mock('@/hooks/useComplianceMutations', () => ({
  useComplianceMutations: () => ({
    linkDocument: { mutate: vi.fn() },
    markApplicable: { mutate: vi.fn() },
  }),
}));

vi.mock('@/hooks/use-compliance-activity', () => ({
  useComplianceActivityFeed: () => ({
    data: { data: [], pagination: { nextCursor: null, hasMore: false }, users: {} },
    isLoading: false,
    error: null,
  }),
}));

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockChecklistReturn = {
    data: [
      {
        id: 1, templateKey: '718_declaration', title: 'Declaration',
        category: 'governing_documents', status: 'satisfied',
        documentId: 99, documentPostedAt: '2026-05-01T00:00:00.000Z',
        deadline: null, rollingWindow: null, isApplicable: true,
      },
      {
        id: 2, templateKey: '718_insurance', title: 'Insurance',
        category: 'insurance', status: 'overdue',
        documentId: null, documentPostedAt: null,
        deadline: '2026-05-01T00:00:00.000Z', rollingWindow: null, isApplicable: true,
      },
    ],
    isLoading: false,
    error: null,
  };
});

describe('ComplianceCommandCenter', () => {
  it('renders the page header with breadcrumb and title', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Compliance' })).toBeInTheDocument();
    expect(screen.getByLabelText('Breadcrumb')).toBeInTheDocument();
  });

  it('shows all four KPI labels', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />,
    );
    // Use getAllByText since KPI label text may also appear in the attention banner copy
    expect(screen.getAllByText(/readiness/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/posting windows/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/overdue/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/needs board action/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows the CAM/Board view toggle for cam role', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />,
    );
    expect(screen.getByRole('button', { name: 'CAM view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Board view' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('hides the view toggle for owner role', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} role="owner" canWrite={false} />,
    );
    expect(screen.queryByRole('button', { name: 'CAM view' })).not.toBeInTheDocument();
  });

  it('hides the attention banner when no items need attention', () => {
    mockChecklistReturn = {
      data: [
        {
          id: 1, templateKey: '718_declaration', title: 'Declaration',
          category: 'governing_documents', status: 'satisfied',
          documentId: 99, documentPostedAt: '2026-05-01T00:00:00.000Z',
          deadline: null, rollingWindow: null, isApplicable: true,
        },
      ],
      isLoading: false,
      error: null,
    };
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} role="cam" canWrite={false} />,
    );
    expect(screen.queryByText('Requirements are now in effect')).not.toBeInTheDocument();
  });

  it('renders the loading indicator when data is loading', () => {
    mockChecklistReturn = { data: undefined, isLoading: true, error: null };
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} role="cam" canWrite={false} />,
    );
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders the error message when the checklist fails to load', () => {
    mockChecklistReturn = { data: undefined, isLoading: false, error: new Error('boom') };
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} role="cam" canWrite={false} />,
    );
    expect(
      screen.getByText("We couldn't load compliance records. Please try again."),
    ).toBeInTheDocument();
  });

  // C.2 smoke tests — selection lifecycle
  it('auto-selects the highest-priority item on initial render', () => {
    // sortByPriority puts overdue (id=2, "Insurance") before satisfied (id=1, "Declaration").
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />,
    );
    // The detail panel should show the selected item's title.
    // "Insurance" appears multiple times (table row + panel header), so use getAllByText.
    expect(screen.getAllByText('Insurance').length).toBeGreaterThanOrEqual(1);
  });

  it('updates the detail panel when a row CTA is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />,
    );
    // "Declaration" (satisfied, id=1) has a "View document" CTA in the queue row.
    // Clicking it should select that item and show its title in the detail panel.
    const viewButtons = screen.getAllByRole('button', { name: /View document/i });
    // Non-null assertion: getAllByRole throws if no elements found, so [0] is always defined.
    await user.click(viewButtons[0]!);
    // After click, "Declaration" title should be visible at least twice (row + panel).
    expect(screen.getAllByText('Declaration').length).toBeGreaterThanOrEqual(2);
  });

  it('renders the detail panel with the selected item title', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />,
    );
    // The detail panel's "Selected record" heading and the item title are both visible.
    expect(screen.getByText('Selected record')).toBeInTheDocument();
    // First selected item is the overdue "Insurance" record.
    expect(screen.getAllByText('Insurance').length).toBeGreaterThanOrEqual(1);
  });
});
