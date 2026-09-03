/**
 * MeetingSchedule — the Schedule view: Upcoming / Past over one table whose
 * row title is the affordance, with the notice window and the derived status
 * beside each meeting (design prototype pp-meetings.js, `schedule`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MeetingListItem } from '@/hooks/use-meetings';
import { MeetingSchedule } from '@/components/meetings/meeting-schedule';

// Wed Aug 26 2026, 9:12 AM in New York.
const NOW = new Date('2026-08-26T13:12:00.000Z');
const TZ = 'America/New_York';

const SEPTEMBER_BOARD: MeetingListItem = {
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

const ANNUAL: MeetingListItem = {
  id: 12,
  title: 'Annual Meeting',
  meetingType: 'annual',
  startsAt: '2026-10-20T23:00:00.000Z',
  endsAt: '2026-10-21T01:00:00.000Z',
  location: 'Ballroom',
  noticePostedAt: '2026-08-20T14:00:00.000Z',
  minutesApprovedAt: null,
  deadlines: {
    noticePostBy: '2026-10-06T23:00:00.000Z',
    ownerVoteDocsBy: '2026-10-13T23:00:00.000Z',
    minutesPostBy: '2026-11-19T23:00:00.000Z',
  },
};

const AUGUST_BOARD: MeetingListItem = {
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

const JULY_BOARD: MeetingListItem = {
  ...AUGUST_BOARD,
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
const onCreateMeeting = vi.fn();
const onRetry = vi.fn();

function renderSchedule(
  overrides: Partial<React.ComponentProps<typeof MeetingSchedule>> = {},
) {
  return render(
    <MeetingSchedule
      meetings={[ANNUAL, AUGUST_BOARD, SEPTEMBER_BOARD, JULY_BOARD]}
      now={NOW}
      timeZone={TZ}
      isLoading={false}
      isError={false}
      onRetry={onRetry}
      canWrite
      onOpenMeeting={onOpenMeeting}
      onCreateMeeting={onCreateMeeting}
      {...overrides}
    />,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('MeetingSchedule', () => {
  it('opens on Upcoming, soonest first, with the type, notice window and status on every row', () => {
    renderSchedule();

    expect(screen.getByRole('button', { name: 'Upcoming 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Past 2' })).toHaveAttribute('aria-pressed', 'false');

    const rows = screen.getAllByRole('row').slice(1); // drop the header row
    expect(rows).toHaveLength(2);

    const first = within(rows[0]!);
    expect(first.getByRole('button', { name: 'September Board Meeting' })).toBeInTheDocument();
    expect(first.getByText('Board · Clubhouse')).toBeInTheDocument();
    expect(first.getByText('48 hours')).toBeInTheDocument();
    expect(first.getByText(/post by Sep 1 · 6:30 PM/)).toBeInTheDocument();
    expect(first.getByText('Notice posts Sep 1')).toBeInTheDocument();

    const second = within(rows[1]!);
    expect(second.getByRole('button', { name: 'Annual Meeting' })).toBeInTheDocument();
    expect(second.getByText('14 days')).toBeInTheDocument();
    expect(second.getByText(/posted Aug 20 · 10:00 AM/)).toBeInTheDocument();
    expect(second.getByText('Noticed Aug 20')).toBeInTheDocument();
  });

  it('Past lists most recent first', async () => {
    const user = userEvent.setup();
    renderSchedule();

    await user.click(screen.getByRole('button', { name: 'Past 2' }));

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('button').textContent)).toEqual([
      'August Board Meeting',
      'July Board Meeting',
    ]);
    expect(within(rows[0]!).getByText('Minutes due Sep 11')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Minutes published')).toBeInTheDocument();
  });

  it('the row title opens that meeting', async () => {
    const user = userEvent.setup();
    renderSchedule();

    await user.click(screen.getByRole('button', { name: 'Annual Meeting' }));

    expect(onOpenMeeting).toHaveBeenCalledWith(12);
  });

  it('an empty Upcoming offers to schedule one — to writers only', () => {
    const { unmount } = renderSchedule({ meetings: [JULY_BOARD] });
    expect(screen.getByRole('button', { name: 'Schedule Meeting' })).toBeInTheDocument();
    unmount();

    renderSchedule({ meetings: [JULY_BOARD], canWrite: false });
    expect(screen.queryByRole('button', { name: 'Schedule Meeting' })).not.toBeInTheDocument();
  });

  it('shows a loading state, and an error with a retry', async () => {
    const user = userEvent.setup();
    const { unmount } = renderSchedule({ meetings: [], isLoading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Loading meetings');
    unmount();

    renderSchedule({ meetings: [], isError: true });
    expect(screen.getByText("Couldn't load meetings")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
