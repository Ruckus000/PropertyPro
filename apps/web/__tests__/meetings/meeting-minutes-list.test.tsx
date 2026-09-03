/**
 * MeetingMinutesList — the Minutes view: every past meeting, most recent
 * first, with whether its minutes are on the record and how long is left to
 * post them (design prototype pp-meetings.js, `minutesCard`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MeetingListItem } from '@/hooks/use-meetings';
import { MeetingMinutesList } from '@/components/meetings/meeting-minutes-list';

// Wed Aug 26 2026, 9:12 AM in New York.
const NOW = new Date('2026-08-26T13:12:00.000Z');
const TZ = 'America/New_York';

const UPCOMING: MeetingListItem = {
  id: 11,
  title: 'September Board Meeting',
  meetingType: 'board',
  startsAt: '2026-09-03T22:30:00.000Z',
  endsAt: null,
  location: 'Clubhouse',
  noticePostedAt: null,
  minutesApprovedAt: null,
  deadlines: {
    noticePostBy: '2026-09-01T22:30:00.000Z',
    ownerVoteDocsBy: '2026-08-27T22:30:00.000Z',
    minutesPostBy: '2026-10-03T22:30:00.000Z',
  },
};

const AUGUST_OWED: MeetingListItem = {
  id: 13,
  title: 'August Board Meeting',
  meetingType: 'board',
  startsAt: '2026-08-12T22:30:00.000Z',
  endsAt: null,
  location: 'Clubhouse',
  noticePostedAt: '2026-08-10T14:00:00.000Z',
  minutesApprovedAt: null,
  deadlines: {
    noticePostBy: '2026-08-10T22:30:00.000Z',
    ownerVoteDocsBy: '2026-08-05T22:30:00.000Z',
    minutesPostBy: '2026-09-11T22:30:00.000Z',
  },
};

const JULY_PUBLISHED: MeetingListItem = {
  ...AUGUST_OWED,
  id: 14,
  title: 'July Board Meeting',
  startsAt: '2026-07-08T22:30:00.000Z',
  minutesApprovedAt: '2026-07-20T15:00:00.000Z',
  deadlines: {
    noticePostBy: '2026-07-06T22:30:00.000Z',
    ownerVoteDocsBy: '2026-07-01T22:30:00.000Z',
    minutesPostBy: '2026-08-07T22:30:00.000Z',
  },
};

const onOpenMeeting = vi.fn();
const onRetry = vi.fn();

function renderList(
  overrides: Partial<React.ComponentProps<typeof MeetingMinutesList>> = {},
) {
  return render(
    <MeetingMinutesList
      communityId={3}
      meetings={[JULY_PUBLISHED, UPCOMING, AUGUST_OWED]}
      now={NOW}
      timeZone={TZ}
      isLoading={false}
      isError={false}
      onRetry={onRetry}
      canWrite
      onOpenMeeting={onOpenMeeting}
      {...overrides}
    />,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('MeetingMinutesList', () => {
  it('lists past meetings most recent first, says what is owed, and offers to author the missing set', () => {
    renderList();

    expect(screen.getByRole('heading', { name: 'Minutes' })).toBeInTheDocument();
    expect(screen.getByText('1 set owed')).toBeInTheDocument();

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);

    const august = within(items[0]!);
    expect(august.getByRole('button', { name: 'Aug 12, 2026 · August Board Meeting' })).toBeInTheDocument();
    expect(august.getByText(/No minutes on record · post by Fri, Sep 11, 2026 · 6:30 PM/)).toBeInTheDocument();
    // 16 days out: the escalation reads "Aware".
    expect(august.getByText('Aware')).toBeInTheDocument();
    expect(august.getByRole('link', { name: 'Author minutes' })).toHaveAttribute(
      'href',
      '/communities/3/meetings/13/minutes/author',
    );

    const july = within(items[1]!);
    expect(july.getByText('Approved Jul 20')).toBeInTheDocument();
    expect(july.getByText('Published')).toBeInTheDocument();
    expect(july.queryByRole('link', { name: 'Author minutes' })).not.toBeInTheDocument();
  });

  it('reads All published when nothing is owed, and hides authoring from readers', () => {
    renderList({ meetings: [JULY_PUBLISHED, AUGUST_OWED], canWrite: false });

    expect(screen.queryByRole('link', { name: 'Author minutes' })).not.toBeInTheDocument();
    expect(screen.getByText('1 set owed')).toBeInTheDocument();
  });

  it('pluralises the owed count and reads All published at zero', () => {
    const { unmount } = renderList({
      meetings: [AUGUST_OWED, { ...JULY_PUBLISHED, minutesApprovedAt: null }],
    });
    expect(screen.getByText('2 sets owed')).toBeInTheDocument();
    unmount();

    renderList({ meetings: [JULY_PUBLISHED] });
    expect(screen.getByText('All published')).toBeInTheDocument();
  });

  it('the meeting name opens that meeting', async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole('button', { name: 'Aug 12, 2026 · August Board Meeting' }));

    expect(onOpenMeeting).toHaveBeenCalledWith(13);
  });

  it('shows an empty state before any meeting has happened, a loading state, and an error with retry', async () => {
    const user = userEvent.setup();
    const { unmount } = renderList({ meetings: [UPCOMING] });
    expect(screen.getByText('No meeting has happened yet.')).toBeInTheDocument();
    unmount();

    const loading = renderList({ meetings: [], isLoading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Loading meetings');
    loading.unmount();

    renderList({ meetings: [], isError: true });
    expect(screen.getByText("Couldn't load meetings")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
