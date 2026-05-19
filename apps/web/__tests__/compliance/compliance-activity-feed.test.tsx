/**
 * Component test for ComplianceActivityFeed (B5 batch #3 drain).
 *
 * Data now flows through the `use-compliance-activity` hook, mocked here so
 * each data-state render and the 403-hide behavior can be asserted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityFetchError } from '../../src/hooks/use-compliance-activity';

const useComplianceActivityFeedMock = vi.fn();

vi.mock('@/hooks/use-compliance-activity', async () => {
  const actual = await vi.importActual<
    typeof import('@/hooks/use-compliance-activity')
  >('@/hooks/use-compliance-activity');
  return {
    ...actual,
    useComplianceActivityFeed: () => useComplianceActivityFeedMock(),
  };
});

vi.mock('../../src/components/compliance/compliance-activity-history-modal', () => ({
  ComplianceActivityHistoryModal: () => null,
}));

import { ComplianceActivityFeed } from '../../src/components/compliance/compliance-activity-feed';

const entry = {
  id: 1,
  userId: 'u1',
  action: 'upload_document',
  resourceType: 'document',
  resourceId: 'Bylaws.pdf',
  metadata: null,
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  useComplianceActivityFeedMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ComplianceActivityFeed', () => {
  it('renders the loading skeleton while loading with no entries', () => {
    useComplianceActivityFeedMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    const { container } = render(<ComplianceActivityFeed communityId={1} />);
    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('returns null (hides the panel) on a 403', () => {
    useComplianceActivityFeedMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ActivityFetchError(403, 'Failed to load activity'),
    });
    const { container } = render(<ComplianceActivityFeed communityId={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the fixed error copy on a non-403 error', () => {
    useComplianceActivityFeedMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ActivityFetchError(500, 'Failed to load activity'),
    });
    render(<ComplianceActivityFeed communityId={1} />);
    expect(
      screen.getByText("Couldn't load recent activity. Try View all history."),
    ).toBeInTheDocument();
  });

  it('shows the empty state when there are no entries', () => {
    useComplianceActivityFeedMock.mockReturnValue({
      data: { data: [], pagination: { nextCursor: null, hasMore: false }, users: {} },
      isLoading: false,
      error: null,
    });
    render(<ComplianceActivityFeed communityId={1} />);
    expect(screen.getByText('No recent activity.')).toBeInTheDocument();
  });

  it('renders entries and deduplicates by id', () => {
    useComplianceActivityFeedMock.mockReturnValue({
      data: {
        data: [entry, { ...entry }],
        pagination: { nextCursor: null, hasMore: false },
        users: { u1: 'Alice Owner' },
      },
      isLoading: false,
      error: null,
    });
    const { container } = render(<ComplianceActivityFeed communityId={1} />);
    expect(screen.getByText('Alice Owner')).toBeInTheDocument();
    expect(container.textContent).toContain('uploaded a document');
    // deduped: only one row despite two identical-id entries
    expect(screen.getAllByText('Bylaws.pdf')).toHaveLength(1);
  });
});
