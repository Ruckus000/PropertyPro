/**
 * MyJoinRequests (D12): a requester sees their own join requests on the
 * join-community page — community name, status and the reviewer's note — so a
 * denied request is explained without waiting on a notification.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useMyJoinRequestsMock = vi.fn();

vi.mock('@/hooks/use-join-requests', () => ({
  useMyJoinRequests: () => useMyJoinRequestsMock(),
}));

import { MyJoinRequests } from '../../src/components/join-requests/my-join-requests';

function setQuery(state: { data?: unknown[]; isLoading?: boolean; isError?: boolean }) {
  useMyJoinRequestsMock.mockReturnValue({
    data: state.data,
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
  });
}

const denied = {
  id: 2,
  communityId: 9,
  communityName: 'Sunset Ridge Apartments',
  unitIdentifier: 'Apt 3B',
  residentType: 'tenant',
  status: 'denied',
  reviewNotes: 'We could not find Apt 3B on the lease roll.',
  reviewedAt: '2026-11-20T15:00:00.000Z',
  createdAt: '2026-11-18T15:00:00.000Z',
};

const pending = {
  ...denied,
  id: 1,
  communityId: 3,
  communityName: 'Sunset Condos',
  unitIdentifier: '101',
  residentType: 'owner',
  status: 'pending',
  reviewNotes: null,
  reviewedAt: null,
};

describe('MyJoinRequests', () => {
  beforeEach(() => useMyJoinRequestsMock.mockReset());

  it('lists each request with its community, status and the review note', () => {
    setQuery({ data: [pending, denied] });
    render(<MyJoinRequests />);

    expect(screen.getByRole('heading', { name: 'Your requests' })).toBeDefined();
    expect(screen.getByText('Sunset Condos')).toBeDefined();
    expect(screen.getByText('Sunset Ridge Apartments')).toBeDefined();
    expect(screen.getByText('Waiting for review')).toBeDefined();
    expect(screen.getByText('Not approved')).toBeDefined();
    expect(screen.getByText('We could not find Apt 3B on the lease roll.')).toBeDefined();
    expect(screen.getAllByText('Note from the manager:')).toHaveLength(1);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders nothing when the user has sent no requests', () => {
    setQuery({ data: [] });
    const { container } = render(<MyJoinRequests />);
    expect(container.textContent).toBe('');
  });

  it('shows a skeleton while loading', () => {
    setQuery({ isLoading: true });
    render(<MyJoinRequests />);
    expect(screen.getByRole('region', { name: 'Your requests' })).toBeDefined();
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('shows an error banner when the list cannot load', () => {
    setQuery({ isError: true });
    render(<MyJoinRequests />);
    expect(screen.getByText("We couldn't load your requests")).toBeDefined();
  });
});
