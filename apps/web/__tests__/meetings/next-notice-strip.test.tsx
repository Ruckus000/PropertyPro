/**
 * The next-notice strip's Post notice verb.
 *
 * The strip shipped without one because nothing in the app wrote
 * `notice_posted_at`. Now that the route does, the strip is where the verb
 * belongs — it is the one place that already names the meeting whose notice
 * is owed soonest.
 *
 * The confirmation is load-bearing, not ceremony. §718.112(2)(c) notice goes
 * on the property AND the website; the platform only witnesses the second, so
 * the stamp is a manager's attestation and the dialog has to say that before
 * a compliance claim appears on the association's public page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MeetingListItem } from '@/hooks/use-meetings';

const { postNoticeMutate, toastSuccess, toastError } = vi.hoisted(() => ({
  postNoticeMutate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/hooks/use-meetings', () => ({
  usePostMeetingNotice: () => ({ mutateAsync: postNoticeMutate, isPending: false }),
}));

vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

import { NextNoticeStrip } from '@/components/meetings/next-notice-strip';

// Mon Sep 14 2026, 2:05 PM in New York.
const NOW = new Date('2026-09-14T18:05:00.000Z');
const TZ = 'America/New_York';

const MEETING: MeetingListItem = {
  id: 11,
  title: 'September Board Meeting',
  meetingType: 'board',
  startsAt: '2026-09-17T22:30:00.000Z',
  endsAt: null,
  location: 'Clubhouse',
  noticePostedAt: null,
  minutesApprovedAt: null,
  deadlines: {
    noticePostBy: '2026-09-15T22:30:00.000Z',
    ownerVoteDocsBy: '2026-09-10T22:30:00.000Z',
    minutesPostBy: '2026-10-17T22:30:00.000Z',
  },
};

const onOpen = vi.fn();

function renderStrip(overrides: Partial<React.ComponentProps<typeof NextNoticeStrip>> = {}) {
  return render(
    <NextNoticeStrip
      communityId={3}
      meeting={MEETING}
      now={NOW}
      timeZone={TZ}
      canWrite
      onOpen={onOpen}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  postNoticeMutate.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('NextNoticeStrip — Post notice', () => {
  it('offers Post notice to a writer, alongside Open', () => {
    renderStrip();

    expect(screen.getByRole('button', { name: 'Post notice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
  });

  it('hides the verb from a reader', () => {
    renderStrip({ canWrite: false });

    expect(screen.queryByRole('button', { name: 'Post notice' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
  });

  it('asks the manager to confirm what they are attesting, naming both places', async () => {
    const user = userEvent.setup();
    renderStrip();

    await user.click(screen.getByRole('button', { name: 'Post notice' }));

    const dialog = await screen.findByRole('alertdialog');
    // The whole point of the confirmation: the platform cannot see the
    // property posting, so the manager states it.
    expect(within(dialog).getByText(/on the property and on the community website/i))
      .toBeInTheDocument();
    expect(within(dialog).getByText(/September Board Meeting/)).toBeInTheDocument();
    expect(postNoticeMutate).not.toHaveBeenCalled();
  });

  it('records the posting only after the manager confirms', async () => {
    const user = userEvent.setup();
    renderStrip();

    await user.click(screen.getByRole('button', { name: 'Post notice' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Record it as posted' }));

    await waitFor(() => expect(postNoticeMutate).toHaveBeenCalledWith(11));
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('backing out of the dialog records nothing', async () => {
    const user = userEvent.setup();
    renderStrip();

    await user.click(screen.getByRole('button', { name: 'Post notice' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(postNoticeMutate).not.toHaveBeenCalled();
  });

  it('surfaces a failure instead of implying the notice was recorded', async () => {
    postNoticeMutate.mockRejectedValue(new Error('Meeting not found'));
    const user = userEvent.setup();
    renderStrip();

    await user.click(screen.getByRole('button', { name: 'Post notice' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Record it as posted' }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('shows no verb once the notice is posted, because the strip is then gone', () => {
    // The shell only renders the strip for a meeting with no stamp
    // (`nextNoticeOwed`), so a posted meeting reaches this component only
    // through a stale render. Guard the verb anyway rather than offering a
    // second posting.
    renderStrip({ meeting: { ...MEETING, noticePostedAt: '2026-09-12T14:00:00.000Z' } });

    expect(screen.queryByRole('button', { name: 'Post notice' })).not.toBeInTheDocument();
  });
});
