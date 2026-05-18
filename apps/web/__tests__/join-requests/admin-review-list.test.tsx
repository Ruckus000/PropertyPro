/**
 * Unit tests for AdminReviewList (B5 batch #1, drain #21).
 *
 * Post-drain: query + review mutation live in `use-admin-join-requests`.
 * Tests mock that hook (the data boundary).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PendingRequest } from '../../src/hooks/use-admin-join-requests';

const useAdminJoinRequestsMock = vi.fn();
const reviewMutateMock = vi.fn();
const useReviewJoinRequestMock = vi.fn();

vi.mock('@/hooks/use-admin-join-requests', () => ({
  useAdminJoinRequests: () => useAdminJoinRequestsMock(),
  useReviewJoinRequest: () => useReviewJoinRequestMock(),
}));

import { AdminReviewList } from '../../src/components/join-requests/admin-review-list';

function setQuery(state: {
  data?: PendingRequest[];
  isLoading?: boolean;
  isError?: boolean;
}) {
  useAdminJoinRequestsMock.mockReturnValue({
    data: state.data,
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
  });
}

function setMutation(error: Error | null = null) {
  useReviewJoinRequestMock.mockReturnValue({ mutate: reviewMutateMock, error });
}

const row: PendingRequest = {
  id: 5,
  userId: 'u1',
  communityId: 7,
  unitIdentifier: 'Unit 5B',
  residentType: 'owner',
  status: 'pending',
  createdAt: '2026-05-18T00:00:00.000Z',
};

describe('AdminReviewList', () => {
  beforeEach(() => {
    useAdminJoinRequestsMock.mockReset();
    useReviewJoinRequestMock.mockReset();
    reviewMutateMock.mockReset();
    setMutation();
  });

  it('renders the error banner copy on query error', () => {
    setQuery({ isError: true });
    render(<AdminReviewList />);
    expect(screen.getByText("We couldn't load join requests")).toBeDefined();
    expect(
      screen.getByText('Please refresh the page to try again.'),
    ).toBeDefined();
  });

  it('renders the empty state when there are no requests', () => {
    setQuery({ data: [] });
    render(<AdminReviewList />);
    expect(screen.getByText('No pending requests')).toBeDefined();
    expect(
      screen.getByText('All join requests have been reviewed.'),
    ).toBeDefined();
  });

  it('renders a request row and approves it via the mutation', () => {
    setQuery({ data: [row] });
    render(<AdminReviewList />);
    expect(screen.getByText('Unit 5B')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(reviewMutateMock).toHaveBeenCalledWith(
      { id: 5, action: 'approve' },
      expect.objectContaining({ onSettled: expect.any(Function) }),
    );
  });

  it('submits a denial with trimmed notes', () => {
    setQuery({ data: [row] });
    render(<AdminReviewList />);

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    fireEvent.change(
      screen.getByLabelText('Reason for denying (sent to requester)'),
      { target: { value: '  bad unit  ' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deny' }));

    expect(reviewMutateMock).toHaveBeenCalledWith(
      { id: 5, action: 'deny', notes: 'bad unit' },
      expect.objectContaining({ onSettled: expect.any(Function) }),
    );
  });

  it('shows the action-failed banner when the mutation errored', () => {
    setQuery({ data: [row] });
    setMutation(new Error('whatever'));
    render(<AdminReviewList />);
    expect(screen.getByText('Action failed')).toBeDefined();
    expect(
      screen.getByText("We couldn't save your review. Please try again."),
    ).toBeDefined();
  });
});
