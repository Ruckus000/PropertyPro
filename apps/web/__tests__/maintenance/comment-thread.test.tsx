/**
 * Unit tests for CommentThread component.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CommentThread } from '../../src/components/maintenance/CommentThread';
import type { CommentItem } from '../../src/lib/api/maintenance-requests';

vi.mock('@/lib/api/maintenance-requests', () => ({
  addComment: vi.fn(),
}));

import { addComment } from '@/lib/api/maintenance-requests';
const mockAddComment = addComment as ReturnType<typeof vi.fn>;

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
    render(
      <CommentThread communityId={42} requestId={1} comments={[]} />,
    );
    expect(screen.getByText('No comments yet.')).toBeDefined();
  });

  it('renders existing comments', () => {
    const comments = [
      makeComment({ id: 1, text: 'First comment' }),
      makeComment({ id: 2, text: 'Second comment' }),
    ];
    render(
      <CommentThread communityId={42} requestId={1} comments={comments} />,
    );
    expect(screen.getByText('First comment')).toBeDefined();
    expect(screen.getByText('Second comment')).toBeDefined();
  });

  it('shows timestamps for each comment', () => {
    const comments = [
      makeComment({ id: 1, text: 'Alpha', createdAt: '2026-01-01T12:00:00Z' }),
      makeComment({ id: 2, text: 'Beta', createdAt: '2026-02-15T08:30:00Z' }),
    ];
    render(
      <CommentThread communityId={42} requestId={1} comments={comments} />,
    );
    // The component renders toLocaleString() for each comment; verify two timestamp
    // elements exist by checking both comment texts are present alongside date text
    const listItems = document.querySelectorAll('li');
    expect(listItems.length).toBe(2);
    // Each li has a timestamp paragraph (the xs text-content-disabled element)
    listItems.forEach((li) => {
      const timestamps = li.querySelectorAll('p');
      // Second <p> is the timestamp
      expect(timestamps.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('disables submit button when textarea is empty', () => {
    render(
      <CommentThread communityId={42} requestId={1} comments={[]} />,
    );
    const button = screen.getByRole('button', { name: 'Post comment' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('submits a comment, calls addComment with correct args, clears textarea, and calls onCommentAdded', async () => {
    const onCommentAdded = vi.fn();
    mockAddComment.mockResolvedValue({ data: makeComment({ text: 'Test comment' }) });

    render(
      <CommentThread
        communityId={42}
        requestId={1}
        comments={[]}
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

    render(
      <CommentThread communityId={42} requestId={1} comments={[]} />,
    );

    const textarea = screen.getByPlaceholderText(/Write a comment/);
    fireEvent.change(textarea, { target: { value: 'Fail comment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post comment' }));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeDefined();
    });
  });

  it('shows "Posting..." while submitting', async () => {
    // Never-resolving promise keeps the component in the submitting state
    mockAddComment.mockReturnValue(new Promise(() => {}));

    render(
      <CommentThread communityId={42} requestId={1} comments={[]} />,
    );

    const textarea = screen.getByPlaceholderText(/Write a comment/);
    fireEvent.change(textarea, { target: { value: 'In-flight comment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post comment' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Posting...' })).toBeDefined();
    });
  });
});
