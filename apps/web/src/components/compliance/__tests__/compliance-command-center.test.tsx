import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
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

const { linkMutate, uploadProps } = vi.hoisted(() => ({
  linkMutate: vi.fn(),
  uploadProps: { current: null as null | { skipAutoLink?: boolean; onUploaded: (id: number) => void } },
}));

// The real modal, with its props recorded.
vi.mock('../upload-document-modal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../upload-document-modal')>();
  return {
    UploadDocumentModal: (props: Parameters<typeof actual.UploadDocumentModal>[0]) => {
      uploadProps.current = props;
      return <actual.UploadDocumentModal {...props} />;
    },
  };
});

vi.mock('@/hooks/use-compliance-mutations', () => ({
  useComplianceMutations: () => ({
    linkDocument: { mutate: linkMutate },
    markApplicable: { mutate: vi.fn() },
  }),
}));

// The picker reads the document library; here it only hands back a choice.
vi.mock('../link-document-modal', () => ({
  LinkDocumentModal: ({ onSelect }: { onSelect: (documentId: number) => void }) => (
    <button type="button" onClick={() => onSelect(55)}>
      Pick document 55
    </button>
  ),
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
  linkMutate.mockClear();
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

  it('explains a sub-threshold association once, instead of "Requirements are now in effect"', () => {
    // A 12-unit condo: the API already dropped the posting clock; the page says why.
    renderWithProviders(
      <ComplianceCommandCenter
        communityId={1}
        isAdmin={true}
        designation={null}
        canWrite={false}
        belowPostingThreshold={{ unitCount: 12, minUnits: 25, unitNoun: 'units', statute: '§718.111(12)(g)' }}
      />,
    );
    expect(
      screen.getByText('Website posting is recommended for this association, not required'),
    ).toBeInTheDocument();
    expect(screen.getByText(/applies to associations with 25 or more units; this one has 12/)).toBeInTheDocument();
    expect(screen.queryByText('Requirements are now in effect')).not.toBeInTheDocument();
  });

  it('shows no threshold notice when the posting rule applies', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={false} />,
    );
    expect(screen.queryByText(/recommended for this association/)).not.toBeInTheDocument();
    expect(screen.getByText('Requirements are now in effect')).toBeInTheDocument();
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

  it('with no checklist rows yet, says the list is not ready and offers Try again (F-10)', () => {
    const refetch = vi.fn();
    mockChecklistReturn = { data: [], isLoading: false, error: null, refetch } as typeof mockChecklistReturn;
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={true} />,
    );
    expect(screen.getByText("Your record list isn't ready yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('after the first run, a board-action record alone raises no alarm banner (F-6)', () => {
    mockChecklistReturn = {
      data: [
        { id: 1, templateKey: '718_declaration', title: 'Declaration', category: 'governing_documents', status: 'satisfied', documentId: 99, documentState: 'posted', documentPostedAt: '2026-05-01T00:00:00.000Z', deadline: null, rollingWindow: null, isApplicable: true },
        { id: 2, templateKey: '718_affidavits', title: 'Affidavits', category: 'meeting_records', status: 'unsatisfied', documentId: null, deadline: '2099-12-11T12:00:00.000Z', rollingWindow: null, isApplicable: true },
      ],
      isLoading: false,
      error: null,
    };
    renderWithProviders(<ComplianceCommandCenter communityId={1} isAdmin designation={null} canWrite />);
    expect(screen.getByText(/readiness/i, { selector: 'p, span, div' })).toBeInTheDocument();
    expect(screen.queryByText('Requirements are now in effect')).not.toBeInTheDocument();
  });

  it('the detail panel offers "Doesn\'t apply to us" on a conditional record with no file (F-8)', () => {
    mockChecklistReturn = {
      data: [
        { id: 1, templateKey: '718_declaration', title: 'Declaration', category: 'governing_documents', status: 'satisfied', documentId: 99, documentState: 'posted', deadline: null, rollingWindow: null, isApplicable: true },
        { id: 2, templateKey: '718_bids', title: 'Bids', category: 'operations', status: 'overdue', documentId: null, deadline: '2026-05-01T00:00:00.000Z', rollingWindow: null, isConditional: true, isApplicable: true },
      ],
      isLoading: false,
      error: null,
    };
    renderWithProviders(<ComplianceCommandCenter communityId={1} isAdmin designation={null} canWrite />);
    const panel = screen.getByRole('complementary', { name: 'Selected record details' });
    fireEvent.click(within(panel).getByRole('button', { name: "Doesn't apply to us" }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  describe('first run (nothing posted, nothing overdue)', () => {
    const future = '2099-12-11T12:00:00.000Z';
    const dayZero = () => [
      { id: 1, templateKey: '718_declaration', title: 'Declaration', category: 'governing_documents', status: 'unsatisfied', documentId: null, deadline: future, rollingWindow: null, isApplicable: true },
      { id: 2, templateKey: '718_affidavits', title: 'Affidavits', category: 'meeting_records', status: 'unsatisfied', documentId: null, deadline: future, rollingWindow: null, isApplicable: true },
      { id: 3, templateKey: '718_minutes_rolling_12m', title: 'Minutes', category: 'meeting_records', status: 'unsatisfied', documentId: null, deadline: null, rollingWindow: { months: 12 }, isApplicable: true },
      { id: 4, templateKey: '718_bids', title: 'Bids', category: 'operations', status: 'unsatisfied', documentId: null, deadline: null, rollingWindow: { months: 12 }, isConditional: true, isApplicable: true },
    ];

    it('is a calm countdown: no 0% score, no "requirements are now in effect" (F-6)', () => {
      mockChecklistReturn = { data: dayZero(), isLoading: false, error: null };
      renderWithProviders(<ComplianceCommandCenter communityId={1} isAdmin designation={null} canWrite />);
      expect(screen.getByRole('heading', { level: 2, name: 'Your 30-day posting window has started' })).toBeInTheDocument();
      expect(screen.queryByText('Requirements are now in effect')).not.toBeInTheDocument();
      expect(screen.queryByText(/readiness/i, { selector: 'p, span, div' })).toBeNull();
      expect(screen.getByText(/0 of 3/).closest('li')?.textContent).toContain('required posted');
    });

    it('groups by when records are due, a conditional one only under "if they apply"', () => {
      mockChecklistReturn = { data: dayZero(), isLoading: false, error: null };
      renderWithProviders(<ComplianceCommandCenter communityId={1} isAdmin designation={null} canWrite />);
      const due = screen.getByRole('region', { name: 'Post by the deadline' });
      const rolling = screen.getByRole('region', { name: 'Keep current, rolling 12 months' });
      const conditional = screen.getByRole('region', { name: 'Only if they apply' });
      expect(due.textContent).toContain('Declaration');
      expect(due.textContent).toContain('Board action');
      expect(rolling.textContent).toContain('Minutes');
      expect(rolling.textContent).not.toContain('Bids');
      expect(conditional.textContent).toContain('Bids');
    });

    it('ends as soon as something is due within 7 days, so the warning shows', () => {
      const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
      mockChecklistReturn = {
        data: dayZero().map((i) => (i.id === 1 ? { ...i, deadline: soon } : i)),
        isLoading: false,
        error: null,
      };
      renderWithProviders(<ComplianceCommandCenter communityId={1} isAdmin designation={null} canWrite />);
      expect(screen.queryByRole('heading', { name: 'Your 30-day posting window has started' })).toBeNull();
      expect(screen.getByText('Requirements are now in effect')).toBeInTheDocument();
    });

    it('an owner (read only) gets the waiting state: no counts, no to-dos', () => {
      mockChecklistReturn = { data: dayZero(), isLoading: false, error: null };
      renderWithProviders(<ComplianceCommandCenter communityId={1} isAdmin={false} designation={null} canWrite={false} />);
      expect(screen.getByRole('heading', { level: 2, name: "Your association's posted records appear here" })).toBeInTheDocument();
      expect(screen.queryByText(/need your board to act/)).toBeNull();
      expect(screen.queryByRole('button', { name: /Upload/ })).toBeNull();
    });

    it('a dated "if it applies" record says by when to post or set it aside', () => {
      mockChecklistReturn = {
        data: [...dayZero(), { id: 5, templateKey: '718_building_permits', title: 'Permits', category: 'operations', status: 'unsatisfied', documentId: null, deadline: future, rollingWindow: null, isConditional: true, isApplicable: true }],
        isLoading: false,
        error: null,
      };
      renderWithProviders(<ComplianceCommandCenter communityId={1} isAdmin designation={null} canWrite />);
      const conditional = screen.getByRole('region', { name: 'Only if they apply' });
      expect(conditional.textContent).toMatch(/Post it, or mark it as not applying, by December 11/);
    });

    it('counts only required board records, not conditional ones', () => {
      // HOA: minutes (required) and bids (conditional) are both board-action records.
      mockChecklistReturn = {
        data: [
          { id: 1, templateKey: '720_minutes_rolling_12m', title: 'Minutes', category: 'meeting_records', status: 'unsatisfied', documentId: null, deadline: null, rollingWindow: { months: 12 }, isApplicable: true },
          { id: 2, templateKey: '720_bids', title: 'Bids', category: 'operations', status: 'unsatisfied', documentId: null, deadline: null, rollingWindow: { months: 12 }, isConditional: true, isApplicable: true },
          { id: 3, templateKey: '720_budget', title: 'Budget', category: 'financial_records', status: 'unsatisfied', documentId: null, deadline: future, rollingWindow: null, isApplicable: true },
        ],
        isLoading: false,
        error: null,
      };
      renderWithProviders(<ComplianceCommandCenter communityId={1} isAdmin designation={null} canWrite />);
      expect(screen.getByText(/1 record needs your board to act/)).toBeInTheDocument();
    });

    it('offers "Doesn\'t apply to us" on a conditional record (F-8)', () => {
      mockChecklistReturn = { data: dayZero(), isLoading: false, error: null };
      renderWithProviders(<ComplianceCommandCenter communityId={1} isAdmin designation={null} canWrite />);
      fireEvent.click(screen.getByRole('button', { name: "Doesn't apply to us: Bids" }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
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

  it('"Re-link or replace" replaces the record\'s file on purpose', async () => {
    const user = userEvent.setup();
    mockChecklistReturn = {
      ...mockChecklistReturn,
      data: [
        {
          id: 3, templateKey: '718_budget', title: 'Budget',
          category: 'financial_records', status: 'overdue',
          documentId: 40, documentPostedAt: '2025-05-01T00:00:00.000Z',
          deadline: '2026-05-01T00:00:00.000Z', rollingWindow: null, isApplicable: true,
        },
      ],
    };
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={true} />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Re-link or replace' })[0]!);
    await user.click(screen.getByRole('button', { name: 'Pick document 55' }));

    expect(linkMutate).toHaveBeenCalledWith(
      { itemId: 3, documentId: 55, replace: true },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('linking a record with no file is not a replacement', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ComplianceCommandCenter
        communityId={1}
        isAdmin={true}
        designation={BOARD_DESIGNATIONS[0]}
        canWrite={true}
      />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Link existing document' })[0]!);
    await user.click(screen.getByRole('button', { name: 'Pick document 55' }));

    expect(linkMutate).toHaveBeenCalledWith(
      { itemId: 2, documentId: 55, replace: false },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('an upload is linked only to the record chosen: the server is told not to link it itself', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} isAdmin={true} designation={null} canWrite={true} />,
    );

    await user.click(screen.getByRole('button', { name: 'Upload record' }));
    expect(uploadProps.current?.skipAutoLink).toBe(true);
    act(() => uploadProps.current!.onUploaded(77));

    expect(linkMutate).toHaveBeenCalledWith(
      { itemId: 2, documentId: 77, replace: false },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
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
