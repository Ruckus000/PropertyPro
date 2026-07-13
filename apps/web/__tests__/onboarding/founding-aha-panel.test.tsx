import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FoundingAhaPanel } from '@/components/onboarding/founding-aha-panel';

const updateMutateMock = vi.fn();

const { checklistMock } = vi.hoisted(() => ({ checklistMock: vi.fn() }));

vi.mock('@/hooks/useComplianceChecklist', () => ({
  useComplianceChecklist: () => checklistMock(),
}));

const DEFAULT_CHECKLIST = {
  data: [
    {
      id: 1,
      title: 'Governing Documents',
      status: 'unsatisfied',
      category: 'governing_documents',
      templateKey: '718_governing_docs',
    },
  ],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};

vi.mock('@/hooks/use-transparency', () => ({
  useTransparencySettings: () => ({
    data: { enabled: false, acknowledgedAt: null },
    isLoading: false,
  }),
  useUpdateTransparencySettings: () => ({
    isPending: false,
    mutate: updateMutateMock,
  }),
}));

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FoundingAhaPanel
        communityId={42}
        communitySlug="sunset-condos"
        communityName="Sunset Condos"
      />
    </QueryClientProvider>,
  );
}

describe('FoundingAhaPanel', () => {
  beforeEach(() => {
    updateMutateMock.mockReset();
    checklistMock.mockReset();
    checklistMock.mockReturnValue(DEFAULT_CHECKLIST);
  });

  it('shows an error + retry (not a false "all on file") when the compliance query errors (B3)', () => {
    const refetch = vi.fn();
    checklistMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });

    renderPanel();

    expect(screen.getByText(/couldn't load your compliance status/i)).toBeInTheDocument();
    expect(screen.queryByText(/all applicable records are on file/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders readiness percentage and transparency CTA for founding admin', () => {
    renderPanel();

    expect(screen.getByText('Get your community live')).toBeInTheDocument();
    expect(screen.getByText(/ready/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish transparency page/i })).toBeDisabled();
  });

  it('calls transparency API with acknowledged true on one-click enable', async () => {
    renderPanel();

    fireEvent.click(screen.getByRole('checkbox', { name: /acknowledge transparency/i }));
    fireEvent.click(screen.getByRole('button', { name: /publish transparency page/i }));

    await waitFor(() => {
      expect(updateMutateMock).toHaveBeenCalledWith(
        { enabled: true, acknowledged: true },
        expect.any(Object),
      );
    });
  });
});
