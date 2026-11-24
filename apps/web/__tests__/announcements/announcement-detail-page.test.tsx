/**
 * An announcement's own page. Edit, Delete and Restore live here, not on the
 * list rows (owner decision, 2026-11-24): a manager is offered them, a
 * resident is offered nothing.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describeAccess } from '@/lib/access/describe-access';

const routerMock = { push: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => routerMock }));

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }));

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
  }),
}));

import { AnnouncementDetailPage } from '../../src/components/announcements/announcement-detail-page';

const about = describeAccess('condo_718', 'announcements', 'sent-to-them')!;

const live = {
  id: 17,
  title: 'Roof inspection scheduled',
  body: '<p>Inspectors arrive next Tuesday.</p><img src="x" onerror="alert(1)">',
  isPinned: false,
  // Midday UTC, so the printed day is the same in any test time zone.
  publishedAt: new Date('2026-04-10T12:00:00.000Z'),
  deletedAt: null as Date | null,
};
const deleted = { ...live, id: 22, title: 'Withdrawn notice', deletedAt: new Date('2026-04-11T09:00:00.000Z') };

function staff(announcement = live, canManage = true, audienceLabel: string | undefined = 'All residents') {
  return render(
    <AnnouncementDetailPage
      view="staff"
      communityId={42}
      announcement={announcement}
      audienceLabel={audienceLabel}
      canManage={canManage}
      about={about}
    />,
  );
}

function resident(announcement = live, audienceLabel?: string, canManage = false) {
  return render(
    <AnnouncementDetailPage
      view="resident"
      communityId={42}
      announcement={announcement}
      audienceLabel={audienceLabel}
      canManage={canManage}
    />,
  );
}

describe('AnnouncementDetailPage', () => {
  beforeEach(() => {
    routerMock.push.mockReset();
    routerMock.refresh.mockReset();
    deleteMutateAsync.mockReset();
    restoreMutateAsync.mockReset();
  });

  it('offers a manager Edit and Delete on a live announcement, and no Restore', () => {
    staff();

    expect(screen.getByRole('heading', { level: 1, name: 'Roof inspection scheduled' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/announcements/17/edit?communityId=42',
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
  });

  it('offers a manager Restore on a deleted announcement, and neither Edit nor Delete', () => {
    staff(deleted);

    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    // The state is a word, not a colour.
    expect(screen.getByText('Deleted')).toBeInTheDocument();
  });

  it('offers a resident nothing: no Edit, Delete or Restore, no panel, no access sentence', () => {
    resident();

    expect(screen.getByRole('heading', { level: 1, name: 'Roof inspection scheduled' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.queryByText(about)).not.toBeInTheDocument();
    // Same record as before: the message and when it was published.
    expect(screen.getByText('Inspectors arrive next Tuesday.')).toBeInTheDocument();
    expect(screen.getByText('Published April 10, 2026')).toBeInTheDocument();
  });

  it('a staff viewer who cannot manage the post (no write permission, not the author) gets no actions', () => {
    staff(live, false);
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('staff: the panel lists the published date and the audience, with the access sentence', () => {
    staff({ ...live, isPinned: true }, true, 'Owners only');

    const details = screen.getByRole('heading', { name: 'Details' }).closest('section')!;
    expect(within(details).getByText('April 10, 2026')).toBeInTheDocument();
    expect(within(details).getByText('Owners only')).toBeInTheDocument();
    expect(within(details).getByText('Pinned')).toBeInTheDocument();
    expect(screen.getByText(about)).toBeInTheDocument();
    // Said once: the line a resident reads above the message is not repeated for staff.
    expect(screen.getAllByText(/April 10, 2026/)).toHaveLength(1);
    expect(screen.getAllByText(/Owners only/)).toHaveLength(1);
    expect(screen.queryByText(/^Pinned · Published/)).not.toBeInTheDocument();
  });

  it('tells a board-seat resident that a post is board-only, and says nothing of the audience otherwise', () => {
    const { unmount } = resident(live, 'Board members only');
    expect(screen.getByText('Published April 10, 2026 · Board members only')).toBeInTheDocument();
    unmount();

    resident(live);
    expect(screen.queryByText(/All residents|Board members only/)).not.toBeInTheDocument();
  });

  it('sanitises the stored body before rendering it', () => {
    const { container } = resident();
    expect(container.querySelector('img')).not.toHaveAttribute('onerror');
  });

  it('Delete asks first; Cancel leaves the announcement alone', async () => {
    const user = userEvent.setup();
    staff();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alertdialog')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(deleteMutateAsync).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  it('confirming the dialog deletes this announcement and refreshes', async () => {
    const user = userEvent.setup();
    deleteMutateAsync.mockResolvedValueOnce({ id: 17, deleted: true });
    staff();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete announcement' });
    await user.click(confirm);

    await waitFor(() => {
      expect(deleteMutateAsync).toHaveBeenCalledWith({ id: 17 });
    });
    expect(routerMock.refresh).toHaveBeenCalled();
    // An admin stays: the page now reads Deleted and offers Restore.
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('an author who is not an admin goes to the list after deleting, not to a page they can no longer open', async () => {
    const user = userEvent.setup();
    deleteMutateAsync.mockResolvedValueOnce({ id: 17, deleted: true });
    resident(live, undefined, true);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete announcement' }));

    await waitFor(() => {
      expect(routerMock.push).toHaveBeenCalledWith('/announcements?communityId=42');
    });
    expect(deleteMutateAsync).toHaveBeenCalledWith({ id: 17 });
  });

  it('a failed delete goes nowhere', async () => {
    const user = userEvent.setup();
    deleteMutateAsync.mockRejectedValueOnce(new Error('Not allowed.'));
    resident(live, undefined, true);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete announcement' }));

    await waitFor(() => expect(deleteMutateAsync).toHaveBeenCalled());
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it('Restore restores the deleted announcement and refreshes', async () => {
    const user = userEvent.setup();
    restoreMutateAsync.mockResolvedValueOnce({ id: 22 });
    staff(deleted);

    await user.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => {
      expect(restoreMutateAsync).toHaveBeenCalledWith({ id: 22 });
    });
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it('says so when a restore fails, and does not refresh', async () => {
    const user = userEvent.setup();
    toastError.mockReset();
    restoreMutateAsync.mockRejectedValueOnce(new Error('Not allowed.'));
    staff(deleted);

    await user.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("We couldn't restore this announcement. Not allowed.");
    });
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});
