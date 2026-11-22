/**
 * MeetingDetailModal — a meeting that fails to load says so.
 *
 * Before: a failed detail read (a deleted meeting, a stale `?meeting=` link)
 * fell into the loading branch, so the dialog said "Loading meeting details..."
 * forever.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const detail = vi.hoisted(() => ({
  current: { data: undefined, isLoading: false, isError: false } as Record<string, unknown>,
}));

vi.mock('@/hooks/use-meetings', () => ({
  useMeeting: () => detail.current,
  useDeleteMeeting: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRecordMeetingMinutes: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/components/documents/DocumentViewerModal', () => ({
  DocumentViewerModal: () => null,
}));

import { MeetingDetailModal } from '@/components/calendar/meeting-detail-modal';

function renderModal(canWrite = false) {
  return render(
    <MeetingDetailModal
      communityId={3}
      communityTimezone="America/New_York"
      meetingId={42}
      canWrite={canWrite}
      onClose={vi.fn()}
      onEdit={vi.fn()}
    />,
  );
}

describe('MeetingDetailModal', () => {
  it('shows an error, not an endless spinner, when the meeting cannot be read', () => {
    detail.current = { data: undefined, isLoading: false, isError: true };

    renderModal();

    expect(screen.getByRole('alert')).toHaveTextContent("We couldn’t load this meeting.");
    expect(screen.queryByText('Loading meeting details...')).not.toBeInTheDocument();
    expect(screen.getByText('Meeting unavailable')).toBeInTheDocument();
  });

  it('still shows loading while the read is in flight', () => {
    detail.current = { data: undefined, isLoading: true, isError: false };

    renderModal();

    expect(screen.getByText('Loading meeting details...')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // D4: the compliance deadlines and their escalation badges are the
  // manager's tracking; a reader sees the meeting, not "post by" dates.
  const MEETING = {
    id: 42,
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
    documents: [],
  };

  it('shows the compliance deadlines to a writer', () => {
    detail.current = { data: MEETING, isLoading: false, isError: false };

    renderModal(true);

    expect(screen.getByText('Compliance deadlines')).toBeInTheDocument();
    expect(screen.getByText('Notice post by')).toBeInTheDocument();
  });

  it('hides the compliance deadlines from a reader, keeping time, location and documents', () => {
    detail.current = { data: MEETING, isLoading: false, isError: false };

    renderModal(false);

    expect(screen.queryByText('Compliance deadlines')).not.toBeInTheDocument();
    expect(screen.queryByText('Notice post by')).not.toBeInTheDocument();
    expect(screen.getByText('Clubhouse')).toBeInTheDocument();
    expect(screen.getByText('Attached documents')).toBeInTheDocument();
  });

  // H-5: minutes uploaded as a file are recorded on the held board meeting.
  describe('Record minutes', () => {
    const recordButton = () => screen.queryByRole('button', { name: 'Record minutes' });

    it('is offered to a writer on a held board meeting with no minutes', () => {
      detail.current = { data: MEETING, isLoading: false, isError: false };
      renderModal(true);
      expect(recordButton()).toBeInTheDocument();
    });

    it('is not offered to a reader, before the meeting, on an owner meeting, or once minutes are posted', () => {
      detail.current = { data: MEETING, isLoading: false, isError: false };
      const reader = renderModal(false);
      expect(recordButton()).not.toBeInTheDocument();
      reader.unmount();

      for (const over of [
        { startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
        { meetingType: 'annual' },
        { minutesApprovedAt: '2026-10-01T12:00:00.000Z' },
      ]) {
        detail.current = { data: { ...MEETING, ...over }, isLoading: false, isError: false };
        const view = renderModal(true);
        expect(recordButton()).not.toBeInTheDocument();
        view.unmount();
      }
    });
  });
});

