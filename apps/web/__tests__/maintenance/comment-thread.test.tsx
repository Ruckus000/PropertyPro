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

// The Radix Checkbox measures its hidden form input with ResizeObserver,
// which jsdom does not provide.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

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

  // The status form's internal notes say "Not visible to residents"; a manager
  // must not read this box the same way.
  it('tells a manager the resident sees comments', () => {
    renderWithClient(
      <CommentThread communityId={42} requestId={1} comments={[]} communityTimezone={TZ} isAdmin />,
    );
    expect(screen.getByLabelText('Add a comment')).toHaveAccessibleDescription('The resident sees comments.');
  });

  it('gives a resident no such note', () => {
    renderWithClient(
      <CommentThread communityId={42} requestId={1} comments={[]} communityTimezone={TZ} />,
    );
    expect(screen.queryByText('The resident sees comments.')).not.toBeInTheDocument();
  });

  // A manager can keep a note from the resident: a vendor quote, a cost, a
  // judgement about the unit. The API already stores it; the box had no way
  // to send it.
  describe('internal notes', () => {
    function typeAndPost(text: string) {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
      fireEvent.click(screen.getByRole('button', { name: /^Post / }));
    }

    it('a resident is not offered one', () => {
      renderWithClient(<CommentThread communityId={42} requestId={1} comments={[]} communityTimezone={TZ} />);
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('a manager posts an ordinary comment by default, with no isInternal sent', async () => {
      mockAddComment.mockResolvedValue({ data: makeComment() });
      renderWithClient(
        <CommentThread communityId={42} requestId={1} comments={[]} communityTimezone={TZ} isAdmin />,
      );
      expect(screen.getByRole('checkbox', { name: 'Internal note (managers only)' })).not.toBeChecked();

      typeAndPost('We will send a plumber Tuesday.');
      await waitFor(() =>
        expect(mockAddComment).toHaveBeenCalledWith({
          communityId: 42,
          requestId: 1,
          text: 'We will send a plumber Tuesday.',
        }),
      );
    });

    it('ticked, says who sees it, relabels the button and sends isInternal: true', async () => {
      mockAddComment.mockResolvedValue({ data: makeComment({ isInternal: true }) });
      renderWithClient(
        <CommentThread communityId={42} requestId={1} comments={[]} communityTimezone={TZ} isAdmin />,
      );
      fireEvent.click(screen.getByRole('checkbox', { name: 'Internal note (managers only)' }));

      const field = screen.getByLabelText('Add an internal note');
      expect(field).toHaveAccessibleDescription('Only managers see internal notes. The resident does not.');
      expect(screen.getByRole('button', { name: 'Post internal note' })).toBeInTheDocument();

      typeAndPost('Vendor quote $900; owner disputes cause.');
      await waitFor(() =>
        expect(mockAddComment).toHaveBeenCalledWith({
          communityId: 42,
          requestId: 1,
          text: 'Vendor quote $900; owner disputes cause.',
          isInternal: true,
        }),
      );
    });

    it('marks a posted internal note with an icon and a leading word; a reply has neither', () => {
      renderWithClient(
        <CommentThread
          communityId={42}
          requestId={1}
          comments={[
            makeComment({ id: 1, text: 'We will send a plumber.' }),
            makeComment({ id: 2, text: 'Vendor quote $900.', isInternal: true }),
          ]}
          communityTimezone={TZ}
          isAdmin
        />,
      );
      const [reply, note] = Array.from(document.querySelectorAll('li'));
      expect(reply!.textContent).not.toContain('Internal note');
      expect(reply!.textContent).not.toContain('Not shown to the resident');
      expect(note!.textContent).toMatch(/^Internal note/);
      expect(note!.textContent).toContain('Not shown to the resident');
    });

    it('cannot be toggled while a post is in flight', async () => {
      mockAddComment.mockReturnValue(new Promise(() => {}));
      renderWithClient(
        <CommentThread communityId={42} requestId={1} comments={[]} communityTimezone={TZ} isAdmin />,
      );
      const box = screen.getByRole('checkbox', { name: 'Internal note (managers only)' });
      fireEvent.click(box);
      typeAndPost('In flight');
      await waitFor(() => expect(box).toBeDisabled());
      expect(box).toBeChecked();
    });

    // A full-width clickable row let a click in empty space beside the box
    // untick it, turning a staff-only note into a reply the resident reads.
    it('only the box and its words toggle it, not the whole row', () => {
      renderWithClient(
        <CommentThread communityId={42} requestId={1} comments={[]} communityTimezone={TZ} isAdmin />,
      );
      const row = screen.getByText('Internal note (managers only)').closest('label')!;
      expect(row.className).toMatch(/(^|\s)w-fit(\s|$)/);
      // Block-level, so the Post button below is not pulled onto its line.
      expect(row.className).toMatch(/(^|\s)flex(\s|$)/);
      expect(row.className).not.toMatch(/(^|\s)inline-flex(\s|$)/);
    });

    it('stays internal for the next note, so it never flips back to public by itself', async () => {
      mockAddComment.mockResolvedValue({ data: makeComment({ isInternal: true }) });
      renderWithClient(
        <CommentThread communityId={42} requestId={1} comments={[]} communityTimezone={TZ} isAdmin />,
      );
      fireEvent.click(screen.getByRole('checkbox', { name: 'Internal note (managers only)' }));
      typeAndPost('First note');
      await waitFor(() => expect(mockAddComment).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));

      typeAndPost('Second note');
      await waitFor(() => expect(mockAddComment).toHaveBeenCalledTimes(2));
      expect(mockAddComment.mock.calls[1]![0]).toMatchObject({ text: 'Second note', isInternal: true });
      expect(screen.getByRole('checkbox', { name: 'Internal note (managers only)' })).toBeChecked();
    });
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
