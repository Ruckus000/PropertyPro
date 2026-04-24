import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams('communityId=42'),
}));

const deleteMutateAsync = vi.fn();
const restoreMutateAsync = vi.fn();

vi.mock('@/hooks/use-announcements', () => ({
  useDeleteAnnouncement: () => ({
    mutateAsync: deleteMutateAsync,
    isPending: false,
    error: null as Error | null,
    reset: vi.fn(),
  }),
  useRestoreAnnouncement: () => ({
    mutateAsync: restoreMutateAsync,
    isPending: false,
    error: null as Error | null,
    reset: vi.fn(),
    variables: undefined as { id: number } | undefined,
  }),
}));

import { AnnouncementList } from '../../src/components/announcements/announcement-list';

const liveAnnouncement = {
  id: 17,
  communityId: 42,
  title: 'Roof inspection scheduled',
  body: '<p>Inspectors arrive next Tuesday.</p>',
  audience: 'all',
  isPinned: false,
  publishedBy: 'user-author',
  publishedAt: '2026-04-10T12:00:00.000Z',
  deletedAt: null,
} as const;

const deletedAnnouncement = {
  id: 22,
  communityId: 42,
  title: 'Withdrawn notice',
  body: '<p>Never mind.</p>',
  audience: 'all',
  isPinned: false,
  publishedBy: 'user-author',
  publishedAt: '2026-04-08T12:00:00.000Z',
  deletedAt: '2026-04-11T09:00:00.000Z',
} as const;

function renderList(props: Parameters<typeof AnnouncementList>[0]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AnnouncementList {...props} />
    </QueryClientProvider>,
  );
}

describe('AnnouncementList', () => {
  beforeEach(() => {
    routerMock.push.mockReset();
    routerMock.refresh.mockReset();
    deleteMutateAsync.mockReset();
    restoreMutateAsync.mockReset();
  });

  it('shows the empty-state CTA for admins and hides it from residents', () => {
    const { rerender } = renderList({
      items: [],
      communityId: 42,
      currentUserId: 'user-author',
      isAdmin: true,
      canWriteAnnouncements: true,
    });
    expect(screen.getByRole('link', { name: 'Create announcement' })).toHaveAttribute(
      'href',
      '/announcements/new?communityId=42',
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={qc}>
        <AnnouncementList
          items={[]}
          communityId={42}
          currentUserId="user-resident"
          isAdmin={false}
          canWriteAnnouncements={false}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('link', { name: 'Create announcement' })).not.toBeInTheDocument();
  });

  it('shows Edit + Delete for admins on live announcements', () => {
    renderList({
      items: [liveAnnouncement],
      communityId: 42,
      currentUserId: 'user-admin',
      isAdmin: true,
      canWriteAnnouncements: true,
    });

    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/announcements/17/edit?communityId=42',
    );
    expect(screen.getByRole('button', { name: /delete/i })).toBeVisible();
  });

  it('shows Delete to the author even when they lack write permission', () => {
    renderList({
      items: [liveAnnouncement],
      communityId: 42,
      currentUserId: 'user-author',
      isAdmin: false,
      canWriteAnnouncements: false,
    });

    expect(screen.getByRole('button', { name: /delete/i })).toBeVisible();
  });

  it('hides manage controls from non-author residents', () => {
    renderList({
      items: [liveAnnouncement],
      communityId: 42,
      currentUserId: 'user-resident',
      isAdmin: false,
      canWriteAnnouncements: false,
    });

    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View details' })).toBeVisible();
  });

  it('renders the Show deleted toggle only for admins', () => {
    const { rerender } = renderList({
      items: [liveAnnouncement],
      communityId: 42,
      currentUserId: 'user-admin',
      isAdmin: true,
      canWriteAnnouncements: true,
    });
    expect(screen.getByRole('link', { name: /show deleted/i })).toBeVisible();

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={qc}>
        <AnnouncementList
          items={[liveAnnouncement]}
          communityId={42}
          currentUserId="user-resident"
          isAdmin={false}
          canWriteAnnouncements={false}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('link', { name: /show deleted/i })).not.toBeInTheDocument();
  });

  it('renders deleted announcements with a Restore button when showDeleted is active', () => {
    renderList({
      items: [liveAnnouncement, deletedAnnouncement],
      communityId: 42,
      currentUserId: 'user-admin',
      isAdmin: true,
      canWriteAnnouncements: true,
      showDeleted: true,
    });

    expect(screen.getByRole('link', { name: /hide deleted/i })).toBeVisible();
    expect(screen.getByText('Withdrawn notice')).toBeVisible();
    expect(screen.getAllByText('Deleted').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /restore/i })).toBeVisible();
  });

  it('opens a confirmation dialog, cancels without mutating', async () => {
    const user = userEvent.setup();
    renderList({
      items: [liveAnnouncement],
      communityId: 42,
      currentUserId: 'user-admin',
      isAdmin: true,
      canWriteAnnouncements: true,
    });

    await user.click(screen.getByRole('button', { name: /delete/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(deleteMutateAsync).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  it('confirms delete and calls the mutation with the selected id', async () => {
    const user = userEvent.setup();
    deleteMutateAsync.mockResolvedValueOnce({ id: 17, deleted: true });

    renderList({
      items: [liveAnnouncement],
      communityId: 42,
      currentUserId: 'user-admin',
      isAdmin: true,
      canWriteAnnouncements: true,
    });

    await user.click(screen.getByRole('button', { name: /delete/i }));
    const dialog = await screen.findByRole('alertdialog');
    const confirmBtn = await screen.findByRole('button', { name: 'Delete announcement' });
    expect(dialog).toContainElement(confirmBtn);
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(deleteMutateAsync).toHaveBeenCalledWith({ id: 17 });
    });
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it('calls the restore mutation when Restore is clicked on a deleted item', async () => {
    const user = userEvent.setup();
    restoreMutateAsync.mockResolvedValueOnce({ id: 22 });

    renderList({
      items: [deletedAnnouncement],
      communityId: 42,
      currentUserId: 'user-admin',
      isAdmin: true,
      canWriteAnnouncements: true,
      showDeleted: true,
    });

    await user.click(screen.getByRole('button', { name: /restore/i }));

    await waitFor(() => {
      expect(restoreMutateAsync).toHaveBeenCalledWith({ id: 22 });
    });
    expect(routerMock.refresh).toHaveBeenCalled();
  });
});
