/**
 * Unit tests for CommentThread component.
 *
 * Restored from fc58cddd7^ (deleted in #1382 as unreferenced) with the
 * component: it now posts through `useAddMaintenanceComment`, so each render
 * gets a QueryClient, and timestamps render in the community's timezone.
 */
import type { ReactElement } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommentThread } from '../../src/components/maintenance/CommentThread';
import type { CommentItem } from '../../src/lib/api/maintenance-requests';

vi.mock('@/lib/api/maintenance-requests', () => ({
  addComment: vi.fn(),
  getRequest: vi.fn(),
  listMyRequests: vi.fn(),
}));

import { addComment } from '@/lib/api/maintenance-requests';
const mockAddComment = addComment as ReturnType<typeof vi.fn>;

const TZ = 'America/New_York';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const makeComment = (overrides: Partial<CommentItem> = {}): CommentItem => ({
  id: 1,
  requestId: 1,
  userId: 'user-1',
  text: 'Test comment text',
  isInternal: false,
  createdAt: '2026-01-01T12:00:00Z',
  ...overrides,
});

describe('CommentThread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "No comments yet" when comments array is empty', () => {
    renderWithClient(
      <CommentThread communityId={42} requestId={1} comments={[]} communityTimezone={TZ} />,
    );
    expect(screen.getByText('No comments yet.')).toBeDefined();
  });

  it('renders existing comments', () => {
    const comments = [
      makeComment({ id: 1, text: 'First comment' }),
      makeComment({ id: 2, text: 'Second comment' }),
    ];
    renderWithClient(
      <CommentThread communityId={42} requestId={1} comments={comments} communityTimezone={TZ} />,
    );
    expect(screen.getByText('First comment')).toBeDefined();
    expect(screen.getByText('Second comment')).toBeDefined();
  });

  it('shows timestamps for each comment, in the community timezone', () => {
    const comments = [
      makeComment({ id: 1, text: 'Alpha', createdAt: '2026-01-01T12:00:00Z' }),
      makeComment({ id: 2, text: 'Beta', createdAt: '2026-02-15T08:30:00Z' }),
    ];
    renderWithClient(
      <CommentThread communityId={42} requestId={1} comments={comments} communityTimezone={TZ} />,
    );
    const listItems = document.querySelectorAll('li');
    expect(listItems.length).toBe(2);
    // 12:00 UTC is 7:00 AM in New York (EST).
    expect(listItems[0]!.textContent).toContain('Jan 1, 2026, 7:00 AM');
    expect(listItems[1]!.textContent).toContain('Feb 15, 2026, 3:30 AM');
  });

  it('names the author: You, the resident who submitted, or management', () => {
    const comments = [
      makeComment({ id: 1, text: 'Mine', userId: 'viewer' }),
      makeComment({ id: 2, text: 'Theirs', userId: 'submitter' }),
      makeComment({ id: 3, text: 'Staff', userId: 'manager' }),
    ];
    renderWithClient(
      <CommentThread
        communityId={42}
        requestId={1}
        comments={comments}
        communityTimezone={TZ}
        viewerUserId="viewer"
        submittedById="submitter"
      />,
    );
    const items = Array.from(document.querySelectorAll('li')).map((li) => li.textContent ?? '');
    expect(items[0]).toMatch(/^Mine\s*You ·/);
    expect(items[1]).toMatch(/^Theirs\s*Resident ·/);
    expect(items[2]).toMatch(/^Staff\s*Management ·/);
  });

  it('disables submit button when textarea is empty', () => {
    renderWithClient(
      <CommentThread communityId={42} requestId={1} comments={[]} communityTimezone={TZ} />,
    );
    const button = screen.getByRole('button', { name: 'Post comment' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('submits a comment, calls addComment with correct args, clears textarea, and calls onCommentAdded', async () => {
    const onCommentAdded = vi.fn();
    mockAddComment.mockResolvedValue({ data: makeComment({ text: 'Test comment' }) });

    renderWithClient(
      <CommentThread
        communityId={42}
        requestId={1}
        comments={[]}
        communityTimezone={TZ}
        onCommentAdded={onCommentAdded}
      />,
    );

    const textarea = screen.getByPlaceholderText(/Write a comment/);
    fireEvent.change(textarea, { target: { value: 'Test comment' } });

    const button = screen.getByRole('button', { name: 'Post comment' });
    expect((button as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(button);

    await waitFor(() => {
      expect(mockAddComment).toHaveBeenCalledTimes(1);
      expect(mockAddComment).toHaveBeenCalledWith({
        communityId: 42,
        requestId: 1,
        text: 'Test comment',
      });
    });

    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe('');
      expect(onCommentAdded).toHaveBeenCalledTimes(1);
    });
  });

  it('shows error message when addComment throws', async () => {
    mockAddComment.mockRejectedValue(new Error('Network error'));

    renderWithClient(
      <CommentThread communityId={42} requestId={1} comments={[]} communityTimezone={TZ} />,
    );

    const textarea = screen.getByPlaceholderText(/Write a comment/);
    fireEvent.change(textarea, { target: { value: 'Fail comment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post comment' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error');
    });
    // The draft survives a failed post.
    expect((textarea as HTMLTextAreaElement).value).toBe('Fail comment');
  });

  it('shows "Posting..." while submitting', async () => {
    // Never-resolving promise keeps the component in the submitting state
    mockAddComment.mockReturnValue(new Promise(() => {}));

    renderWithClient(
      <CommentThread communityId={42} requestId={1} comments={[]} communityTimezone={TZ} />,
    );

    const textarea = screen.getByPlaceholderText(/Write a comment/);
    fireEvent.change(textarea, { target: { value: 'In-flight comment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post comment' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Posting...' })).toBeDefined();
    });
  });
});
