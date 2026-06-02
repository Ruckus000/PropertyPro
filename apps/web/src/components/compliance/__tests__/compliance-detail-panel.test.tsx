import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ComplianceDetailPanel } from '../compliance-detail-panel';

// Default mock for useComplianceActivityFeed. Individual tests may override
// `mockActivityReturn` before rendering.
let mockActivityReturn: {
  data: unknown;
  isLoading: boolean;
  error: unknown;
} = {
  data: {
    data: [
      {
        id: 1,
        userId: 'u',
        action: 'link_document',
        resourceType: 'compliance_checklist_item',
        resourceId: '1',
        metadata: null,
        createdAt: '2026-05-26T10:42:00Z',
      },
    ],
    pagination: { nextCursor: null, hasMore: false },
    users: {},
  },
  isLoading: false,
  error: null,
};

vi.mock('@/hooks/use-compliance-activity', () => ({
  useComplianceActivityFeed: () => mockActivityReturn,
}));

const ITEM = {
  id: 1,
  templateKey: '718_insurance',
  title: 'Current insurance declaration',
  category: 'insurance',
  status: 'unsatisfied' as const,
  documentId: null,
  documentPostedAt: null,
  deadline: '2026-06-14T00:00:00.000Z',
  rollingWindow: null,
  isApplicable: true,
};

function withQuery(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  // Reset to default mock before each test
  mockActivityReturn = {
    data: {
      data: [
        {
          id: 1,
          userId: 'u',
          action: 'link_document',
          resourceType: 'compliance_checklist_item',
          resourceId: '1',
          metadata: null,
          createdAt: '2026-05-26T10:42:00Z',
        },
      ],
      pagination: { nextCursor: null, hasMore: false },
      users: {},
    },
    isLoading: false,
    error: null,
  };
});

describe('ComplianceDetailPanel', () => {
  it('renders the selected item title and pills', () => {
    withQuery(
      <ComplianceDetailPanel
        item={ITEM}
        communityId={1}
        canWrite
        role="cam"
        onUpload={vi.fn()}
        onLink={vi.fn()}
        onView={vi.fn()}
        onMarkApplicable={vi.fn()}
      />,
    );
    expect(screen.getByText('Current insurance declaration')).toBeInTheDocument();
    expect(screen.getByText('Action needed')).toBeInTheDocument();
  });

  it('renders the resolved CTA for unsatisfied + no document + CAM', () => {
    withQuery(
      <ComplianceDetailPanel
        item={ITEM}
        communityId={1}
        canWrite
        role="cam"
        onUpload={vi.fn()}
        onLink={vi.fn()}
        onView={vi.fn()}
        onMarkApplicable={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Upload document/i })).toBeInTheDocument();
  });

  it('renders the empty-selection state when item is null', () => {
    withQuery(
      <ComplianceDetailPanel
        item={null}
        communityId={1}
        canWrite
        role="cam"
        onUpload={vi.fn()}
        onLink={vi.fn()}
        onView={vi.fn()}
        onMarkApplicable={vi.fn()}
      />,
    );
    expect(screen.getByText(/Select a record/i)).toBeInTheDocument();
  });

  it('hides Recent Activity section when the activity hook 403s', () => {
    // Override the mock return value before rendering (no vi.doMock needed —
    // the module-level `mockActivityReturn` variable approach used for
    // compliance-command-center tests works cleanly in this vitest setup).
    mockActivityReturn = {
      data: undefined,
      isLoading: false,
      error: { status: 403, message: 'Forbidden' },
    };
    withQuery(
      <ComplianceDetailPanel
        item={ITEM}
        communityId={1}
        canWrite
        role="cam"
        onUpload={vi.fn()}
        onLink={vi.fn()}
        onView={vi.fn()}
        onMarkApplicable={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Recent activity/i)).not.toBeInTheDocument();
  });

  it('renders hidden-by-filter notice with Clear filter button when isSelectedHidden=true', () => {
    withQuery(
      <ComplianceDetailPanel
        item={ITEM}
        communityId={1}
        canWrite
        role="cam"
        onUpload={vi.fn()}
        onLink={vi.fn()}
        onView={vi.fn()}
        onMarkApplicable={vi.fn()}
        isSelectedHidden={true}
        onClearFilter={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Selected record is hidden by the current filter/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear filter/i })).toBeInTheDocument();
  });

  it('calls onClearFilter when the Clear filter button is clicked', () => {
    const onClearFilter = vi.fn();
    withQuery(
      <ComplianceDetailPanel
        item={ITEM}
        communityId={1}
        canWrite
        role="cam"
        onUpload={vi.fn()}
        onLink={vi.fn()}
        onView={vi.fn()}
        onMarkApplicable={vi.fn()}
        isSelectedHidden={true}
        onClearFilter={onClearFilter}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Clear filter/i }));
    expect(onClearFilter).toHaveBeenCalledOnce();
  });
});
