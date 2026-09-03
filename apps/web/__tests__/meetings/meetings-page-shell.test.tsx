/**
 * MeetingsPageShell — three readings of one set, one at a time.
 *
 * Before: the calendar, the selected day, an empty-state card and an
 * "Email Calendar Reminders" card all stacked on one page — five cards
 * competing for the same glance. The design prototype (pp-meetings.js) puts a
 * Calendar / Schedule / Minutes switcher in the page toolbar, shows one view at
 * a time, and carries exactly one piece of cross-view context: the next notice
 * owed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MeetingListItem } from '@/hooks/use-meetings';

const routerReplace = vi.fn();
let search = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
  usePathname: () => '/communities/3/meetings',
  useSearchParams: () => search,
}));

const refetchEvents = vi.fn();
const refetchMeetings = vi.fn();
let meetingsData: MeetingListItem[] = [];

vi.mock('@/hooks/use-meetings', () => ({
  useCalendarEvents: () => ({ data: [], isLoading: false, isError: false, refetch: refetchEvents }),
  useMeetings: () => ({
    data: meetingsData,
    isLoading: false,
    isError: false,
    refetch: refetchMeetings,
  }),
  usePostMeetingNotice: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const monthGridSpy = vi.fn();
vi.mock('@/components/calendar/month-grid', () => ({
  MonthGrid: () => {
    monthGridSpy();
    return <div>Month Grid</div>;
  },
}));
vi.mock('@/components/calendar/day-detail-panel', () => ({
  DayDetailPanel: () => <div>Day Panel</div>,
}));
vi.mock('@/components/calendar/meeting-detail-modal', () => ({
  MeetingDetailModal: ({ meetingId }: { meetingId: number }) => <div>Detail {meetingId}</div>,
}));
vi.mock('@/components/meetings/meeting-form', () => ({
  MeetingForm: () => <div>Meeting Form</div>,
}));

import { MeetingsPageShell } from '@/components/meetings/meetings-page-shell';

// Wed Aug 26 2026, 9:12 AM in New York.
const NOW = new Date('2026-08-26T13:12:00.000Z');

const UPCOMING_BOARD: MeetingListItem = {
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

const UPCOMING_ANNUAL: MeetingListItem = {
  id: 12,
  title: 'Annual Meeting',
  meetingType: 'annual',
  startsAt: '2026-10-20T23:00:00.000Z',
  endsAt: '2026-10-21T01:00:00.000Z',
  location: 'Ballroom',
  noticePostedAt: null,
  minutesApprovedAt: null,
  deadlines: {
    noticePostBy: '2026-10-06T23:00:00.000Z',
    ownerVoteDocsBy: '2026-10-13T23:00:00.000Z',
    minutesPostBy: '2026-11-19T23:00:00.000Z',
  },
};

const PAST_OWED: MeetingListItem = {
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

function renderShell(overrides: Partial<{ canWrite: boolean }> = {}) {
  return render(
    <MeetingsPageShell
      communityId={3}
      userId="user-1"
      role="property_manager"
      timezone="America/New_York"
      communityType="condo_718"
      canWrite={overrides.canWrite ?? true}
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  search = new URLSearchParams();
  meetingsData = [UPCOMING_BOARD, UPCOMING_ANNUAL, PAST_OWED];
  routerReplace.mockReset();
  monthGridSpy.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('MeetingsPageShell — one switcher, one view at a time', () => {
  it('offers exactly Calendar, Schedule and Minutes, with Create Meeting in the toolbar for writers', () => {
    renderShell();

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Calendar',
      'Schedule',
      'Minutes 1 owed',
    ]);
    expect(screen.getByRole('button', { name: 'Create Meeting' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Meetings & Calendar' })).toBeInTheDocument();
  });

  it('shows no Create Meeting to a reader', () => {
    renderShell({ canWrite: false });

    expect(screen.queryByRole('button', { name: 'Create Meeting' })).not.toBeInTheDocument();
  });

  it('mounts only the calendar on cold entry — no schedule table, no minutes list, no reminders card', () => {
    renderShell();

    expect(screen.getByText('Month Grid')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Calendar' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: /^Upcoming/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Minutes' })).not.toBeInTheDocument();
    // The prototype carries no reminders card; reminder timing lives in Settings.
    expect(screen.queryByText('Email Calendar Reminders')).not.toBeInTheDocument();
  });

  it('?view=schedule mounts the schedule and not the calendar', () => {
    search = new URLSearchParams('view=schedule');

    renderShell();

    expect(screen.getByRole('button', { name: /^Upcoming/ })).toBeInTheDocument();
    expect(screen.queryByText('Month Grid')).not.toBeInTheDocument();
    expect(monthGridSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: 'Schedule' })).toHaveAttribute('aria-selected', 'true');
  });

  it('?view=minutes mounts the minutes list and not the calendar', () => {
    search = new URLSearchParams('view=minutes');

    renderShell();

    expect(screen.getByRole('heading', { name: 'Minutes' })).toBeInTheDocument();
    expect(screen.queryByText('Month Grid')).not.toBeInTheDocument();
  });

  it('an unknown ?view is the calendar', () => {
    search = new URLSearchParams('view=agenda');

    renderShell();

    expect(screen.getByText('Month Grid')).toBeInTheDocument();
  });

  it('switching views replaces the URL, keeps other params, and does not scroll', async () => {
    search = new URLSearchParams('foo=bar');
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('tab', { name: 'Schedule' }));

    // `replace`, not `push`: Back should leave the page, not walk every view.
    expect(routerReplace).toHaveBeenCalledWith('/communities/3/meetings?foo=bar&view=schedule', {
      scroll: false,
    });
  });

  it('counts owed minutes on the Minutes tab, and drops the count when nothing is owed', () => {
    const { unmount } = renderShell();
    expect(screen.getByRole('tab', { name: /^Minutes/ })).toHaveTextContent('Minutes 1 owed');
    unmount();

    meetingsData = [UPCOMING_BOARD, { ...PAST_OWED, minutesApprovedAt: '2026-08-20T15:00:00.000Z' }];
    renderShell();
    expect(screen.getByRole('tab', { name: 'Minutes' })).toHaveTextContent(/^Minutes$/);
  });

  it('carries the next notice owed above every view, and Open shows that meeting', async () => {
    search = new URLSearchParams('view=minutes');
    const user = userEvent.setup();
    renderShell();

    const strip = screen.getByRole('region', { name: 'Next notice owed' });
    // The board meeting's 48-hour deadline (Sep 1) comes before the annual
    // meeting's 14-day one (Oct 6), so it is the one carried.
    expect(within(strip).getByText(/September Board Meeting/)).toBeInTheDocument();
    expect(within(strip).getByText(/Tue, Sep 1, 2026 · 6:30 PM/)).toBeInTheDocument();
    expect(within(strip).getByText('Notice posts Sep 1')).toBeInTheDocument();

    await user.click(within(strip).getByRole('button', { name: 'Open' }));

    expect(screen.getByText('Detail 11')).toBeInTheDocument();
  });

  it('shows no strip when every upcoming notice is posted', () => {
    meetingsData = [
      { ...UPCOMING_BOARD, noticePostedAt: '2026-08-25T14:00:00.000Z' },
      { ...UPCOMING_ANNUAL, noticePostedAt: '2026-08-25T14:00:00.000Z' },
      PAST_OWED,
    ];

    renderShell();

    expect(screen.queryByRole('region', { name: 'Next notice owed' })).not.toBeInTheDocument();
  });
});
