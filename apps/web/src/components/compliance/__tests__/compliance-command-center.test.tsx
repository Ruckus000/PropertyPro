import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ComplianceCommandCenter } from '../compliance-command-center';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const refetchMock = vi.fn();

let mockChecklistReturn: { data: unknown[] | undefined; isLoading: boolean; error: Error | null; refetch: () => void } = {
  data: [],
  isLoading: false,
  error: null,
  refetch: () => {},
};

vi.mock('@/hooks/useComplianceChecklist', () => ({
  useComplianceChecklist: () => mockChecklistReturn,
  COMPLIANCE_QUERY_KEY: 'compliance-checklist',
}));

vi.mock('@/hooks/useComplianceMutations', () => ({
  useComplianceMutations: () => ({
    linkDocument: { mutate: vi.fn() },
    unlinkDocument: { mutate: vi.fn() },
    markNotApplicable: { mutate: vi.fn() },
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

const FIXTURE = [
  {
    id: 1, templateKey: '718_declaration', title: 'Declaration',
    description: null, category: 'governing_documents', status: 'satisfied',
    statuteReference: '§718.111', documentId: 99, documentPostedAt: '2026-05-01T00:00:00.000Z',
    deadline: null, rollingWindow: null, isApplicable: true,
  },
  {
    id: 2, templateKey: '718_insurance', title: 'Insurance',
    description: null, category: 'insurance', status: 'overdue',
    statuteReference: '§718.111', documentId: null, documentPostedAt: null,
    deadline: '2026-05-01T00:00:00.000Z', rollingWindow: null, isApplicable: true,
  },
];

function renderWithProviders(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockChecklistReturn = { data: structuredClone(FIXTURE), isLoading: false, error: null, refetch: refetchMock };
});

describe('ComplianceCommandCenter', () => {
  it('renders the page header with breadcrumb and title', () => {
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Compliance' })).toBeInTheDocument();
    expect(screen.getByLabelText('Breadcrumb')).toBeInTheDocument();
  });

  it('renders the risk-first hero with a danger verdict when overdue', () => {
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />);
    expect(screen.getByText(/record is overdue|records are overdue/i)).toBeVisible();
    expect(screen.getByRole('progressbar', { name: /compliance readiness/i })).toBeInTheDocument();
  });

  it('renders the four metric labels', () => {
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />);
    expect(screen.getAllByText(/readiness/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/posting windows/i)).toBeInTheDocument();
    expect(screen.getAllByText(/overdue/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/needs board action/i)).toBeInTheDocument();
  });

  it('puts the overdue item in the Needs-you zone and the satisfied item in the Done zone', () => {
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />);
    expect(screen.getByRole('heading', { name: 'Needs you' })).toBeInTheDocument();
    expect(screen.getByText('Insurance')).toBeVisible();
    // Done zone is a collapsed <details> summary
    expect(screen.getByText(/caught up on 1 record/i)).toBeInTheDocument();
  });

  it('does NOT render a CAM/Board view toggle', () => {
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />);
    expect(screen.queryByRole('button', { name: 'CAM view' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Board view' })).toBeNull();
  });

  it('navigates to /documents when Upload record is clicked (writable user)', () => {
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upload record' }));
    expect(pushMock).toHaveBeenCalledWith('/documents');
  });

  it('hides the Upload record action for a read-only user', () => {
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="owner" canWrite={false} />);
    expect(screen.queryByRole('button', { name: 'Upload record' })).toBeNull();
  });

  it('shows a success hero and an all-caught-up empty state when nothing needs attention', () => {
    mockChecklistReturn = {
      data: [structuredClone(FIXTURE[0])], // only the satisfied item
      isLoading: false,
      error: null,
      refetch: refetchMock,
    };
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={false} />);
    expect(screen.getByText(/fully compliant/i)).toBeVisible();
    expect(screen.getByText(/you're all caught up/i)).toBeVisible();
  });

  it('renders a loading skeleton when data is loading', () => {
    mockChecklistReturn = { data: undefined, isLoading: true, error: null, refetch: refetchMock };
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={false} />);
    expect(screen.getByTestId('compliance-loading')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('renders a recoverable error banner that calls refetch on Retry', () => {
    mockChecklistReturn = { data: undefined, isLoading: false, error: new Error('boom'), refetch: refetchMock };
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={false} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/couldn't load compliance records/i);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });
});
