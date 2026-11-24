/**
 * The announcements list: the records (`AnnouncementList`) and the page that
 * frames them (`AnnouncementsListPage`).
 *
 * Rows carry no Edit, Delete or Restore (owner decision, 2026-11-24): a row's
 * title opens the announcement and those actions live on its page, covered by
 * announcement-detail-page.test.tsx.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { describeAccess } from '@/lib/access/describe-access';
import { AnnouncementList } from '../../src/components/announcements/announcement-list';
import {
  AnnouncementsListPage,
  announcementsListHref,
} from '../../src/components/announcements/announcements-list-page';

const about = describeAccess('condo_718', 'announcements', 'sent-to-them')!;

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

type ListProps = Parameters<typeof AnnouncementList>[0];

function renderList(props: Partial<ListProps> & Pick<ListProps, 'items'>) {
  return render(<AnnouncementList communityId={42} showDeleted={false} {...props} />);
}

describe('AnnouncementList', () => {
  it('shows the empty-state CTA for writers and hides it from residents', () => {
    const { unmount } = renderList({ items: [], canWrite: true });
    expect(screen.getByRole('link', { name: 'Write an announcement' })).toHaveAttribute(
      'href',
      '/announcements/new?communityId=42',
    );
    unmount();

    renderList({ items: [], canWrite: false });
    expect(screen.queryByRole('link', { name: 'Write an announcement' })).not.toBeInTheDocument();
  });

  it('names a search that matched nothing and offers to clear it, instead of "No announcements yet"', () => {
    renderList({
      items: [],
      canWrite: true,
      searchQuery: 'pool',
      clearSearchHref: announcementsListHref(42),
    });

    expect(screen.getByText('No announcements match “pool”')).toBeInTheDocument();
    expect(screen.queryByText('No announcements yet')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear search' })).toHaveAttribute(
      'href',
      '/announcements?communityId=42',
    );
  });

  it('with no search and nothing posted, a writer gets the first-post guide', () => {
    renderList({ items: [], canWrite: true });

    expect(screen.getByRole('heading', { level: 2, name: 'Keep everyone in the loop' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Write an announcement' })).toHaveAttribute(
      'href',
      '/announcements/new?communityId=42',
    );
    // Urgent news is pointed at emergency alerts, not posted here.
    expect(screen.getByRole('link', { name: 'Emergency alerts' })).toHaveAttribute('href', '/emergency?communityId=42');
    expect(screen.queryByRole('link', { name: 'Clear search' })).not.toBeInTheDocument();
  });

  it('a reader with nothing posted gets the calm waiting state', () => {
    renderList({ items: [], canWrite: false });

    expect(screen.getByRole('heading', { level: 2, name: 'News from your community appears here' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Write an announcement' })).not.toBeInTheDocument();
  });

  it('with deleted rows on and none to show, says so', () => {
    renderList({ items: [], canWrite: true, showDeleted: true });
    expect(screen.getByText('No deleted announcements')).toBeInTheDocument();
  });

  it('a row links to the announcement', () => {
    renderList({ items: [liveAnnouncement], canWrite: true });

    expect(screen.getByRole('link', { name: 'Roof inspection scheduled' })).toHaveAttribute(
      'href',
      '/announcements/17?communityId=42',
    );
    // The body is previewed as text, never as markup.
    expect(screen.getByText('Inspectors arrive next Tuesday.')).toBeInTheDocument();
  });

  it('a row carries no Edit, Delete or Restore, even for a writer looking at deleted rows', () => {
    renderList({
      items: [liveAnnouncement, deletedAnnouncement],
      canWrite: true,
      showDeleted: true,
    });

    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // The only links are the two titles.
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Roof inspection scheduled',
      'Withdrawn notice',
    ]);
  });

  it('hides deleted rows unless they are asked for, and marks them with a word when shown', () => {
    const { unmount } = renderList({ items: [liveAnnouncement, deletedAnnouncement] });
    expect(screen.queryByText('Withdrawn notice')).not.toBeInTheDocument();
    unmount();

    renderList({ items: [liveAnnouncement, deletedAnnouncement], showDeleted: true });
    const deletedRow = screen.getByText('Withdrawn notice').closest('li')!;
    expect(within(deletedRow).getByText(/^Deleted · /)).toBeInTheDocument();
    // An admin opens the deleted post from here to restore it.
    expect(within(deletedRow).getByRole('link', { name: 'Withdrawn notice' })).toHaveAttribute(
      'href',
      '/announcements/22?communityId=42',
    );
    const liveRow = screen.getByText('Roof inspection scheduled').closest('li')!;
    expect(within(liveRow).getByText(/^Published · /)).toBeInTheDocument();
  });

  it('groups pinned posts above the rest under "Pinned" and "Recent"', () => {
    renderList({
      items: [liveAnnouncement, { ...liveAnnouncement, id: 30, title: 'Pool rules', isPinned: true }],
    });

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Pinned', 'Recent']);
    const pinned = screen.getByRole('heading', { name: 'Pinned' }).closest('section')!;
    expect(within(pinned).getByRole('link', { name: 'Pool rules' })).toBeInTheDocument();
    expect(within(pinned).queryByRole('link', { name: 'Roof inspection scheduled' })).not.toBeInTheDocument();
  });

  it('marks board-only posts for every reader, so a board seat knows not to share them', () => {
    renderList({
      items: [liveAnnouncement, { ...liveAnnouncement, id: 18, title: 'Legal update', audience: 'board_only' }],
      canWrite: false,
    });
    expect(screen.getAllByText(/Board only/)).toHaveLength(1);
    expect(screen.getByText('Legal update').closest('li')?.textContent).toContain('Board only');
  });
});

describe('AnnouncementsListPage', () => {
  it('staff: a writer gets "New announcement", an admin gets "Show deleted", and the access sentence is shown', () => {
    render(
      <AnnouncementsListPage
        view="staff"
        communityId={42}
        canWrite
        deletedToggle={{ showing: false, href: announcementsListHref(42, { includeDeleted: true }) }}
        about={about}
      >
        <p>records</p>
      </AnnouncementsListPage>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Announcements' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New announcement' })).toHaveAttribute(
      'href',
      '/announcements/new?communityId=42',
    );
    expect(screen.getByRole('link', { name: 'Show deleted' })).toHaveAttribute(
      'href',
      '/announcements?includeDeleted=true&communityId=42',
    );
    expect(screen.getByText(about)).toBeInTheDocument();
    expect(screen.getByText('records')).toBeInTheDocument();
  });

  it('staff with deleted rows on: the toggle reads "Hide deleted" and keeps the search', () => {
    render(
      <AnnouncementsListPage
        view="staff"
        communityId={42}
        canWrite
        deletedToggle={{ showing: true, href: announcementsListHref(42, { query: 'pool' }) }}
      >
        <p>records</p>
      </AnnouncementsListPage>,
    );
    expect(screen.getByRole('link', { name: 'Hide deleted' })).toHaveAttribute(
      'href',
      '/announcements?q=pool&communityId=42',
    );
  });

  it('resident: no action, no deleted toggle, no access sentence, no panel', () => {
    render(
      <AnnouncementsListPage view="resident" communityId={42}>
        <p>records</p>
      </AnnouncementsListPage>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Announcements' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(about)).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByText('records')).toBeInTheDocument();
  });
});
