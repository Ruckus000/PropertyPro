import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ComplianceCommandCenter } from '../compliance-command-center';

vi.mock('@/hooks/useComplianceChecklist', () => ({
  useComplianceChecklist: () => ({
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
  }),
  COMPLIANCE_QUERY_KEY: 'compliance-checklist',
}));

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

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
});
