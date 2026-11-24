import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';

const { useNotificationsMock, useMarkReadMock, mutate, refetch, push } = vi.hoisted(() => ({
  useNotificationsMock: vi.fn(),
  useMarkReadMock: vi.fn(),
  mutate: vi.fn(),
  refetch: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: useNotificationsMock,
  useMarkRead: useMarkReadMock,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

import { NotificationsPageClient } from '@/components/notifications/notifications-page-client';
import type { NotificationFilters, NotificationItem } from '@/hooks/use-notifications';

function item(id: number, over: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id,
    category: 'announcement',
    title: `Notice ${id}`,
    body: `Body ${id}`,
    actionUrl: `/announcements/${id}`,
    sourceType: 'announcement',
    sourceId: String(id),
    priority: 'normal',
    readAt: null,
    archivedAt: null,
    createdAt: '2026-03-01T10:00:00.000Z',
    ...over,
  };
}

function page(items: NotificationItem[], nextCursor: string | null = null) {
  return { data: items, pagination: { nextCursor, hasMore: nextCursor !== null, pageSize: 20 } };
}

function result(over: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    refetch,
    ...over,
  };
}

function lastFilters(): NotificationFilters {
  return useNotificationsMock.mock.calls.at(-1)![1] as NotificationFilters;
}

const two = [item(1), item(2, { readAt: '2026-03-02T10:00:00.000Z', category: 'document' })];

describe('NotificationsPageClient', () => {
  beforeEach(() => {
    mutate.mockReset();
    refetch.mockReset();
    push.mockReset();
    useNotificationsMock.mockReset();
    useNotificationsMock.mockReturnValue(result({ data: page(two) }));
    useMarkReadMock.mockReset();
    useMarkReadMock.mockReturnValue({ mutate, isPending: false });
  });

  it('paints the title and description, with no side panel', () => {
    const { container } = render(<NotificationsPageClient communityId={4} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
    expect(screen.getByText('Updates from your community, newest first.')).toBeVisible();
    expect(container.querySelector('aside')).toBeNull();
    expect(container.querySelector('[data-page-template="list"]')).not.toBeNull();
  });

  it('asks for 20 per page, every category, read and unread, on first render', () => {
    render(<NotificationsPageClient communityId={4} />);
    expect(useNotificationsMock).toHaveBeenLastCalledWith(4, {
      limit: 20,
      category: undefined,
      unreadOnly: false,
      cursor: undefined,
    });
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('filters by the category chosen and marks that filter pressed', async () => {
    const user = userEvent.setup();
    render(<NotificationsPageClient communityId={4} />);
    for (const label of ['All', 'Announcements', 'Documents', 'Meetings', 'Maintenance', 'Violations', 'Elections']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: 'Documents' }));
    expect(lastFilters().category).toBe('document');
    expect(screen.getByRole('button', { name: 'Documents' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(lastFilters().category).toBeUndefined();
  });

  it('filters to unread only when the box is ticked, and back when unticked', async () => {
    const user = userEvent.setup();
    render(<NotificationsPageClient communityId={4} />);
    const box = screen.getByRole('checkbox', { name: 'Unread only' });
    expect(box).not.toBeChecked();
    await user.click(box);
    expect(lastFilters().unreadOnly).toBe(true);
    expect(box).toBeChecked();
    await user.click(box);
    expect(lastFilters().unreadOnly).toBe(false);
  });

  it('marks everything in this community read from the toolbar button', async () => {
    const user = userEvent.setup();
    render(<NotificationsPageClient communityId={4} />);
    await user.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ communityId: 4, all: true }, expect.anything());
  });

  it('disables Mark all read while the request is in flight', () => {
    useMarkReadMock.mockReturnValue({ mutate, isPending: true });
    render(<NotificationsPageClient communityId={4} />);
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
  });

  it('marks the section busy while loading and draws no rows', () => {
    useNotificationsMock.mockReturnValue(result({ isLoading: true, isFetching: true }));
    const { container } = render(<NotificationsPageClient communityId={4} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
    expect(container.querySelector('section[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole('listitem')).toBeNull();
    expect(screen.queryByText("You're all caught up")).toBeNull();
  });

  it('says the reader is caught up when there is nothing to show, keeping the filters', () => {
    useNotificationsMock.mockReturnValue(result({ data: page([]) }));
    render(<NotificationsPageClient communityId={4} />);
    expect(screen.getByRole('heading', { level: 2, name: "You're all caught up" })).toBeVisible();
    expect(screen.getByText('New activity will appear here as it happens.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Documents' })).toBeInTheDocument();
    expect(screen.queryByText(/^Showing/)).toBeNull();
  });

  it('shows an alert with a retry on error', async () => {
    const user = userEvent.setup();
    useNotificationsMock.mockReturnValue(result({ isError: true }));
    render(<NotificationsPageClient communityId={4} />);
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load your notifications");
    expect(screen.queryByRole('listitem')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('writes each row state in words', () => {
    useNotificationsMock.mockReturnValue(
      result({ data: page([...two, item(3, { priority: 'urgent', category: 'violation' })]) }),
    );
    render(<NotificationsPageClient communityId={4} />);
    const [unread, read, urgent] = screen.getAllByRole('listitem');
    expect(unread).toHaveTextContent('Notice 1');
    expect(unread).toHaveTextContent('Body 1');
    expect(unread).toHaveTextContent(/Unread · Announcement · /);
    expect(read).toHaveTextContent(/Read · Document · /);
    expect(read).not.toHaveTextContent('Unread');
    expect(urgent).toHaveTextContent(/Urgent · Unread · Violation · /);
  });

  it('offers no Load more on the last page', () => {
    render(<NotificationsPageClient communityId={4} />);
    expect(screen.getByText('Showing 2')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('loads the next page under the first, using the cursor the API returned', async () => {
    const user = userEvent.setup();
    const first = page([item(1), item(2)], 'cursor-2');
    const second = page([item(3), item(4)]);
    useNotificationsMock.mockImplementation((_id: number, filters: NotificationFilters) =>
      result({ data: filters.cursor === 'cursor-2' ? second : first }),
    );
    render(<NotificationsPageClient communityId={4} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(lastFilters().cursor).toBe('cursor-2');
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((r) => within(r).getByText(/^Notice \d$/).textContent)).toEqual([
      'Notice 1',
      'Notice 2',
      'Notice 3',
      'Notice 4',
    ]);
    expect(screen.getByText('Showing 4')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('does not repeat the first page while the next one is still loading', async () => {
    const user = userEvent.setup();
    const first = page([item(1), item(2)], 'cursor-2');
    // keepPreviousData: with the new cursor the hook still returns page one.
    useNotificationsMock.mockImplementation((_id: number, filters: NotificationFilters) =>
      filters.cursor === 'cursor-2'
        ? result({ data: first, isFetching: true, isPlaceholderData: true })
        : result({ data: first }),
    );
    render(<NotificationsPageClient communityId={4} />);
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
  });

  it('goes back to the first page when a filter changes', async () => {
    const user = userEvent.setup();
    const first = page([item(1), item(2)], 'cursor-2');
    const second = page([item(3), item(4)]);
    const meetings = page([item(9, { category: 'meeting' })]);
    useNotificationsMock.mockImplementation((_id: number, filters: NotificationFilters) =>
      result({
        data: filters.category === 'meeting' ? meetings : filters.cursor === 'cursor-2' ? second : first,
      }),
    );
    render(<NotificationsPageClient communityId={4} />);
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: 'Meetings' }));

    expect(lastFilters()).toEqual({ limit: 20, category: 'meeting', unreadOnly: false, cursor: undefined });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Notice 9')).toBeVisible();
  });

  it('marks an unread row read and opens its link when the row is clicked', async () => {
    const user = userEvent.setup();
    render(<NotificationsPageClient communityId={4} />);
    await user.click(screen.getByRole('button', { name: /Notice 1/ }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ communityId: 4, ids: [1] }, expect.anything());
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/announcements/1');
  });

  it('opens an already-read row without marking it read again', async () => {
    const user = userEvent.setup();
    render(<NotificationsPageClient communityId={4} />);
    await user.click(screen.getByRole('button', { name: /Notice 2/ }));
    expect(mutate).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/announcements/2');
  });

  it('marks a row with no link read and stays on the page', async () => {
    const user = userEvent.setup();
    useNotificationsMock.mockReturnValue(result({ data: page([item(5, { actionUrl: null })]) }));
    render(<NotificationsPageClient communityId={4} />);
    await user.click(screen.getByRole('button', { name: /Notice 5/ }));
    expect(mutate).toHaveBeenCalledWith({ communityId: 4, ids: [5] }, expect.anything());
    expect(push).not.toHaveBeenCalled();
  });

  it('is not busy during a background refetch of the page already shown', () => {
    useNotificationsMock.mockReturnValue(result({ data: page(two), isFetching: true }));
    const { container } = render(<NotificationsPageClient communityId={4} />);
    expect(container.querySelector('section')).toHaveAttribute('aria-busy', 'false');
  });

  it('is busy while a filter change still shows the previous rows', () => {
    useNotificationsMock.mockReturnValue(
      result({ data: page(two), isFetching: true, isPlaceholderData: true }),
    );
    const { container } = render(<NotificationsPageClient communityId={4} />);
    expect(container.querySelector('section')).toHaveAttribute('aria-busy', 'true');
  });

  it('after Mark all read on a second page, goes back to page one and no row says Unread', async () => {
    const user = userEvent.setup();
    let allRead = false;
    const stamp = (items: NotificationItem[]) =>
      allRead ? items.map((n) => ({ ...n, readAt: '2026-03-03T10:00:00.000Z' })) : items;
    // The server refetch reaches only the page the hook is asked for.
    useNotificationsMock.mockImplementation((_id: number, filters: NotificationFilters) =>
      result({
        data:
          filters.cursor === 'cursor-2'
            ? page(stamp([item(3), item(4)]))
            : page(stamp([item(1), item(2)]), 'cursor-2'),
      }),
    );
    mutate.mockImplementation((_payload: unknown, options?: { onSuccess?: () => void }) => {
      allRead = true;
      options?.onSuccess?.();
    });
    render(<NotificationsPageClient communityId={4} />);
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: 'Mark all read' }));

    expect(lastFilters().cursor).toBeUndefined();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).not.toHaveTextContent('Unread');
      expect(row).toHaveTextContent(/Read · /);
    }
  });

  it('marks a link-less row from an earlier page read in place, and a second click sends nothing', async () => {
    const user = userEvent.setup();
    useNotificationsMock.mockImplementation((_id: number, filters: NotificationFilters) =>
      result({
        data:
          filters.cursor === 'cursor-2'
            ? page([item(3), item(4)])
            : page([item(1, { actionUrl: null }), item(2)], 'cursor-2'),
      }),
    );
    mutate.mockImplementation((_payload: unknown, options?: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });
    render(<NotificationsPageClient communityId={4} />);
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    const row = () => screen.getAllByRole('listitem')[0]!;
    expect(row()).toHaveTextContent(/Unread · /);

    await user.click(screen.getByRole('button', { name: /Notice 1/ }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(row()).toHaveTextContent('Notice 1');
    expect(row()).not.toHaveTextContent('Unread');
    expect(screen.getAllByRole('listitem')).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: /Notice 1/ }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('drops a row marked read from an earlier page when showing unread only', async () => {
    const user = userEvent.setup();
    useNotificationsMock.mockImplementation((_id: number, filters: NotificationFilters) =>
      result({
        data:
          filters.cursor === 'cursor-2'
            ? page([item(3), item(4)])
            : page([item(1, { actionUrl: null }), item(2)], 'cursor-2'),
      }),
    );
    mutate.mockImplementation((_payload: unknown, options?: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });
    render(<NotificationsPageClient communityId={4} />);
    await user.click(screen.getByRole('checkbox', { name: 'Unread only' }));
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await user.click(screen.getByRole('button', { name: /Notice 1/ }));
    expect(screen.queryByText('Notice 1')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('has no axe violations with rows', async () => {
    useNotificationsMock.mockReturnValue(
      result({ data: page([...two, item(3, { priority: 'urgent' })], 'cursor-2') }),
    );
    const { container } = render(<NotificationsPageClient communityId={4} />);
    expect(container.querySelectorAll('li')).toHaveLength(3);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations on the empty state', async () => {
    useNotificationsMock.mockReturnValue(result({ data: page([]) }));
    const { container } = render(<NotificationsPageClient communityId={4} />);
    expect(screen.getByRole('heading', { level: 2 })).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });
});
