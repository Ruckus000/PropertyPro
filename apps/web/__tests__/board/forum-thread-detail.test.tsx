import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
        ],
      },
      isLoading: false,
      error: null,
    });
    useCreateForumReplyMock.mockReturnValue(makeMutationState());
    useDeleteForumReplyMock.mockReturnValue(makeMutationState());
    useUpdateForumThreadMock.mockReturnValue(makeMutationState());
  });

  it('renders tombstones for removed replies and moderation controls for admins', () => {
    render(
      <ForumThreadDetail
        communityId={42}
        threadId={10}
        isAdmin
        canModerateReplies
      />,
    );

    expect(screen.getByText('A live reply')).toBeVisible();
    expect(screen.getByText('Reply removed')).toBeVisible();
    expect(
      screen.getByText(/the conversation order has been preserved/i),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Remove Reply' })).toBeVisible();
  });

  it('hides moderation controls from residents while still showing tombstones', () => {
    render(
      <ForumThreadDetail
        communityId={42}
        threadId={10}
        isAdmin={false}
        canModerateReplies={false}
      />,
    );

    expect(screen.getByText('Reply removed')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Remove Reply' })).not.toBeInTheDocument();
  });

  it('hides moderation controls for admins without reply moderation capability', () => {
    render(
      <ForumThreadDetail
        communityId={42}
        threadId={10}
        isAdmin
        canModerateReplies={false}
      />,
    );

    expect(screen.getByText('Reply removed')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Remove Reply' })).not.toBeInTheDocument();
  });

  it('shows reply removal errors inside the confirmation dialog while it is open', async () => {
    const user = userEvent.setup();
    useDeleteForumReplyMock.mockReturnValue({
      ...makeMutationState(),
      error: new Error('Please try again later.'),
    });

    render(
      <ForumThreadDetail
        communityId={42}
        threadId={10}
        isAdmin
        canModerateReplies
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Remove Reply' }));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText("We couldn't remove this reply.")).toBeVisible();
    expect(within(dialog).getByText('Please try again later.')).toBeVisible();
  });
});
