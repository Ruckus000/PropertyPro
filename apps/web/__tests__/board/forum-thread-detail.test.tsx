import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const {
  useBoardForumThreadMock,
  useCreateForumReplyMock,
  useDeleteForumReplyMock,
  useUpdateForumThreadMock,
  getNameMock,
} = vi.hoisted(() => ({
  useBoardForumThreadMock: vi.fn(),
  useCreateForumReplyMock: vi.fn(),
  useDeleteForumReplyMock: vi.fn(),
  useUpdateForumThreadMock: vi.fn(),
  getNameMock: vi.fn((userId: string) => `User ${userId}`),
}));

vi.mock('@/hooks/use-board', () => ({
  useBoardForumThread: useBoardForumThreadMock,
  useCreateForumReply: useCreateForumReplyMock,
  useDeleteForumReply: useDeleteForumReplyMock,
  useUpdateForumThread: useUpdateForumThreadMock,
}));

vi.mock('@/hooks/use-user-names', () => ({
  useUserNames: () => ({
    getName: getNameMock,
  }),
}));

import { ForumThreadDetail } from '../../src/components/board/forum/forum-thread-detail';

function makeMutationState() {
  return {
    isPending: false,
    error: null,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ForumThreadDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useBoardForumThreadMock.mockReturnValue({
      data: {
        thread: {
          id: 10,
          title: 'Landscape plan',
          body: 'Should we add more shade trees near the clubhouse?',
          authorUserId: 'author-1',
          isPinned: false,
          isLocked: false,
          createdAt: '2026-04-10T14:00:00.000Z',
          updatedAt: '2026-04-10T14:00:00.000Z',
        },
        replies: [
          {
            id: 100,
            threadId: 10,
            body: 'A live reply',
            authorUserId: 'resident-1',
            createdAt: '2026-04-10T15:00:00.000Z',
            updatedAt: '2026-04-10T15:00:00.000Z',
            deletedAt: null,
          },
          {
            id: 101,
            threadId: 10,
            body: '',
            authorUserId: 'resident-2',
            createdAt: '2026-04-10T16:00:00.000Z',
            updatedAt: '2026-04-10T16:00:00.000Z',
            deletedAt: '2026-04-10T17:00:00.000Z',
          },
          {
            id: 102,
            threadId: 10,
            body: 'Another live reply',
            authorUserId: 'resident-3',
            createdAt: '2026-04-10T18:00:00.000Z',
            updatedAt: '2026-04-10T18:00:00.000Z',
            deletedAt: null,
          },
        ],
      },
      isLoading: false,
      error: null,
    });
    useCreateForumReplyMock.mockReturnValue(makeMutationState());
    useDeleteForumReplyMock.mockReturnValue(makeMutationState());
    useUpdateForumThreadMock.mockReturnValue(makeMutationState());
  });

  it('renders tombstones for deleted replies and delete controls for moderators', () => {
    render(
      <ForumThreadDetail
        communityId={42}
        threadId={10}
        currentUserId="moderator-1"
        isAdmin
        canModerateReplies
      />,
    );

    expect(screen.getByText('A live reply')).toBeVisible();
    expect(screen.getByText('Another live reply')).toBeVisible();
    expect(screen.getByText('Reply deleted')).toBeVisible();
    expect(
      screen.getByText(/conversation order is preserved/i),
    ).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Delete reply' })).toHaveLength(2);
  });

  it('shows delete controls to reply authors only for their own live replies', () => {
    render(
      <ForumThreadDetail
        communityId={42}
        threadId={10}
        currentUserId="resident-1"
        isAdmin={false}
        canModerateReplies={false}
      />,
    );

    expect(screen.getByText('Reply deleted')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete reply' })).toBeVisible();
  });

  it('hides delete controls from users who do not own a reply or moderate replies', () => {
    render(
      <ForumThreadDetail
        communityId={42}
        threadId={10}
        currentUserId="resident-9"
        isAdmin={false}
        canModerateReplies={false}
      />,
    );

    expect(screen.getByText('Reply deleted')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Delete reply' })).not.toBeInTheDocument();
  });

  it('hides delete controls for admins without reply moderation capability unless they own the reply', () => {
    render(
      <ForumThreadDetail
        communityId={42}
        threadId={10}
        currentUserId="admin-1"
        isAdmin
        canModerateReplies={false}
      />,
    );

    expect(screen.getByText('Reply deleted')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Delete reply' })).not.toBeInTheDocument();
  });

  it('cancels delete confirmation without calling the mutation', async () => {
    const user = userEvent.setup();
    const deleteMutation = makeMutationState();
    useDeleteForumReplyMock.mockReturnValue(deleteMutation);

    render(
      <ForumThreadDetail
        communityId={42}
        threadId={10}
        currentUserId="resident-1"
        isAdmin={false}
        canModerateReplies={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Delete reply' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(deleteMutation.mutateAsync).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  it('confirms delete with the selected reply id', async () => {
    const user = userEvent.setup();
    const deleteMutation = makeMutationState();
    useDeleteForumReplyMock.mockReturnValue(deleteMutation);

    render(
      <ForumThreadDetail
        communityId={42}
        threadId={10}
        currentUserId="resident-1"
        isAdmin={false}
        canModerateReplies={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Delete reply' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete reply' }));

    expect(deleteMutation.mutateAsync).toHaveBeenCalledWith({ replyId: 100 });
  });

  it('shows reply delete errors inside the confirmation dialog while it is open', async () => {
    const user = userEvent.setup();
    useDeleteForumReplyMock.mockReturnValue({
      ...makeMutationState(),
      error: new Error('Please try again later.'),
    });

    render(
      <ForumThreadDetail
        communityId={42}
        threadId={10}
        currentUserId="moderator-1"
        isAdmin
        canModerateReplies
      />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Delete reply' })[0]!);

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText("We couldn't delete this reply.")).toBeVisible();
    expect(within(dialog).getByText('Please try again later.')).toBeVisible();
  });
});
