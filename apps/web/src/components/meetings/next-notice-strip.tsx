'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { usePostMeetingNotice, type MeetingListItem } from '@/hooks/use-meetings';
import {
  describeMeetingStatus,
  formatDeadlineStamp,
  noticeWindowLabel,
} from '@/lib/meetings/meeting-status';

interface NextNoticeStripProps {
  communityId: number;
  meeting: MeetingListItem;
  now: Date;
  timeZone: string;
  canWrite: boolean;
  onOpen: (meetingId: number) => void;
}

/**
 * The one piece of cross-view context worth carrying: the next notice owed.
 *
 * One row, rendered only when something is actually owed — the shell omits
 * it otherwise, because an "all clear" panel is clutter nobody needed to read.
 *
 * Post notice records an ATTESTATION. §718.112(2)(c) notice goes on the
 * property AND the community website, and the platform can only witness the
 * second, so the confirmation says what the manager is stating before a
 * compliance claim appears on the association's public transparency page.
 */
export function NextNoticeStrip({
  communityId,
  meeting,
  now,
  timeZone,
  canWrite,
  onOpen,
}: NextNoticeStripProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const postNotice = usePostMeetingNotice(communityId);
  const status = describeMeetingStatus(meeting, now, timeZone);
  const startsAt = new Date(meeting.startsAt);
  // The shell only passes a meeting with no stamp, but a stale render must
  // not offer a second posting.
  const canPost = canWrite && !meeting.noticePostedAt;

  async function handleConfirm() {
    try {
      await postNotice.mutateAsync(meeting.id);
      setConfirmOpen(false);
      toast.success('Notice recorded as posted.');
    } catch (error) {
      setConfirmOpen(false);
      toast.error(
        error instanceof Error ? error.message : 'Could not record the notice as posted.',
      );
    }
  }

  return (
    <section
      aria-label="Next notice owed"
      className="rounded-md border border-edge-subtle bg-surface-card px-5 py-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-content">
            {meeting.title} · notice posts by{' '}
            {formatDeadlineStamp(meeting.deadlines.noticePostBy, timeZone)}
          </p>
          <p className="text-xs text-content-tertiary">
            The {noticeWindowLabel(meeting)} window · meeting{' '}
            {startsAt.toLocaleDateString('en-US', {
              timeZone,
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
            ,{' '}
            {startsAt.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <StatusBadge status={status.badge} label={status.label} subtle />
          <Button variant="outline" size="sm" onClick={() => onOpen(meeting.id)}>
            Open
          </Button>
          {canPost ? (
            <Button size="sm" onClick={() => setConfirmOpen(true)}>
              Post notice
            </Button>
          ) : null}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Record this notice as posted?</AlertDialogTitle>
            <AlertDialogDescription>
              You are stating that the notice and agenda for {meeting.title} are posted on the
              property and on the community website. PropertyPro records the date and who recorded
              it, and shows it on your public compliance page. It cannot check the property
              posting for you.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={postNotice.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Keep the dialog up while the request is in flight; the
                // handler closes it on both outcomes.
                event.preventDefault();
                void handleConfirm();
              }}
              disabled={postNotice.isPending}
            >
              Record it as posted
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
