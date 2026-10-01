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
}));
vi.mock('@/components/documents/DocumentViewerModal', () => ({
  DocumentViewerModal: () => null,
}));

import { MeetingDetailModal } from '@/components/calendar/meeting-detail-modal';

function renderModal() {
  return render(
    <MeetingDetailModal
      communityId={3}
      communityTimezone="America/New_York"
      meetingId={42}
      canWrite={false}
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
});
