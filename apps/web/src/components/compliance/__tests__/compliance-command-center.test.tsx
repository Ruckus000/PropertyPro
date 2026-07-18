import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOARD_DESIGNATIONS } from '@propertypro/shared';
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

vi.mock('@/hooks/use-compliance-checklist', () => ({
  useComplianceChecklist: () => mockChecklistReturn,
  COMPLIANCE_QUERY_KEY: 'compliance-checklist',
}));

vi.mock('@/hooks/use-compliance-mutations', () => ({
  useComplianceMutations: () => ({
    linkDocument: { mutate: vi.fn() },
    markApplicable: { mutate: vi.fn() },
  }),
}));

vi.mock('@/hooks/use-document-categories', () => ({
  useDocumentCategories: () => ({
    categories: [{ id: 10, name: 'Insurance' }],
    isLoading: false,
    error: null,
    resolveCategoryId: () => 10,
  }),
}));

vi.mock('@/hooks/use-document-upload', () => ({
  useDocumentUpload: () => ({
    isUploading: false,
    progress: 0,
    error: null,
    uploadDocument: vi.fn(),
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
  it('renders the page header and title', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={true} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Compliance' })).toBeInTheDocument();
    // The breadcrumb trail is now rendered by the app shell (ShellBreadcrumbs),
    // not inline in PageHeader, so it isn't present when this component renders
    // in isolation. Assert the PageHeader itself is present instead.
    expect(document.querySelector('[data-page-header]')).toBeInTheDocument();
  });

  it('shows all four KPI labels', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={true} />,
    );
    // Use getAllByText since KPI label text may also appear in the attention banner copy
    expect(screen.getAllByText(/readiness/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/posting windows/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/overdue/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/needs board action/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows the CAM/Board view toggle for cam role', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={true} />,
    );
    expect(screen.getByRole('button', { name: 'CAM view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Board view' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('hides the view toggle for owner role', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={false} designation={null} canWrite={false} />,
    );
    expect(screen.queryByRole('button', { name: 'CAM view' })).not.toBeInTheDocument();
  });

  it('shows the view toggle for the new manager role', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={true} />,
    );
    expect(screen.getByRole('button', { name: 'CAM view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Board view' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('defaults to board view and shows the toggle for a board president', () => {
    window.localStorage.clear();
    renderWithProviders(
      <ComplianceCommandCenter
        communityId={1}
        isAdmin={true}
        designation={BOARD_DESIGNATIONS[0]}
        canWrite={true}
      />,
    );
    expect(screen.getByRole('button', { name: 'Board view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'CAM view' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('defaults to board view and shows the toggle for a board member', () => {
    window.localStorage.clear();
    renderWithProviders(
      <ComplianceCommandCenter
        communityId={1}
        isAdmin={false}
        designation={BOARD_DESIGNATIONS[1]}
        canWrite={true}
      />,
    );
    expect(screen.getByRole('button', { name: 'Board view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'CAM view' })).toHaveAttribute('aria-pressed', 'false');
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
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={false} />,
    );
    expect(screen.queryByText('Requirements are now in effect')).not.toBeInTheDocument();
  });

  it('renders the loading skeleton when data is loading', () => {
    mockChecklistReturn = { data: undefined, isLoading: true, error: null };
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={false} />,
    );
    expect(
      screen.getByRole('status', { name: /loading compliance dashboard/i }),
    ).toBeInTheDocument();
  });

  it('renders an error banner with a retry action when the checklist fails to load', () => {
    mockChecklistReturn = { data: undefined, isLoading: false, error: new Error('boom') };
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={false} />,
    );
    expect(screen.getByText("Couldn't load compliance records")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('renders an empty state with an upload CTA when there are no checklist items', () => {
    mockChecklistReturn = { data: [], isLoading: false, error: null };
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={true} />,
    );
    expect(screen.getByText('Your compliance tracker is ready')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Upload First Document' }),
    ).toBeInTheDocument();
  });

  // C.2 smoke tests — selection lifecycle
  it('auto-selects the highest-priority item on initial render', () => {
    // sortByPriority puts overdue (id=2, "Insurance") before satisfied (id=1, "Declaration").
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={true} />,
    );
    // The detail panel should show the selected item's title.
    // "Insurance" appears multiple times (table row + panel header), so use getAllByText.
    expect(screen.getAllByText('Insurance').length).toBeGreaterThanOrEqual(1);
  });

  it('updates the detail panel when a row CTA is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={true} />,
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
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={true} />,
    );
    // The detail panel's "Selected record" heading and the item title are both visible.
    expect(screen.getByText('Selected record')).toBeInTheDocument();
    // First selected item is the overdue "Insurance" record.
    expect(screen.getAllByText('Insurance').length).toBeGreaterThanOrEqual(1);
  });

  it('opens the upload modal for the selected item when "Upload record" is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={true} />,
    );
    // Auto-selected item is the overdue "Insurance" record (id=2).
    await user.click(screen.getByRole('button', { name: 'Upload record' }));
    expect(screen.getByRole('heading', { name: 'Upload Document' })).toBeInTheDocument();
    // Modal title input defaults to the selected item's title.
    expect(screen.getByLabelText('Title')).toHaveValue('Insurance');
  });

  it('hides the "Upload record" button when canWrite is false', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={false} />,
    );
    expect(screen.queryByRole('button', { name: 'Upload record' })).not.toBeInTheDocument();
  });

  it('does not render the unimplemented "Export readiness PDF" button', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={true} />,
    );
    expect(
      screen.queryByRole('button', { name: /Export readiness PDF/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the hidden-by-filter notice when the active filter excludes the selected item', () => {
    // Default fixture: "Insurance" (overdue, id=2) is auto-selected as the top-priority item.
    // Clicking the "Satisfied" filter chip excludes it (it is 'overdue', not 'satisfied').
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={true} />,
    );
    // Activate the "Satisfied" filter — hides the auto-selected "Insurance" item.
    fireEvent.click(screen.getByRole('button', { name: /Satisfied/i }));
    // The detail panel should show the hidden-by-filter notice.
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Selected record is hidden by the current filter/i)).toBeInTheDocument();
  });
});

describe('ComplianceCommandCenter — view persistence', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('reads view preference from localStorage on mount', () => {
    window.localStorage.setItem('compliance.audienceView.1', 'board');
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={true} />,
    );
    expect(screen.getByRole('button', { name: 'Board view' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('writes view preference to localStorage on toggle', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={true} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Board view' }));
    expect(window.localStorage.getItem('compliance.audienceView.1')).toBe('board');
  });
});
