/**
 * What decided a meeting-notice checklist row: which meetings' notices were
 * recorded on time, which were not, and the next one due.
 *
 * States what was recorded and when it was due. It does not judge whether a
 * meeting was valid — PropertyPro does not give legal advice.
 */
import Link from 'next/link';
import type { MeetingNoticeSummary } from '@/lib/compliance/meeting-notice-status';
import { formatMeetingTitle } from '@/lib/utils/format-meeting-title';

/** How many missed notices to name before summarising the rest. */
const MISSED_SHOWN = 5;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function MeetingNoticeChecks({
  summary,
  communityId,
}: {
  summary: MeetingNoticeSummary;
  communityId: number;
}) {
  const shown = summary.missed.slice(0, MISSED_SHOWN);
  const more = summary.missed.length - shown.length;
  const ok = summary.missed.length === 0;

  return (
    <div className="my-4 space-y-3 border-y border-edge-subtle py-4 text-sm" data-testid="meeting-notice-checks">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            ok ? 'bg-status-success-bg text-status-success' : 'bg-status-danger-bg text-status-danger'
          }`}
        >
          {ok ? '✓' : '!'}
        </span>
        <div>
          <div className="font-semibold">
            Notices on time: {summary.onTimeCount} of {summary.dueCount}
          </div>
          <div className="text-xs text-content-secondary">
            Scored from your meetings over the past {summary.windowMonths} months. A notice counts as
            on time when it was recorded as posted by its deadline.
          </div>
        </div>
      </div>

      {shown.length > 0 ? (
        <div>
          <div className="font-semibold">Missed</div>
          <ul className="mt-1 space-y-1 text-content-secondary">
            {shown.map((miss) => (
              <li key={miss.meetingId}>
                <span className="font-medium text-content">{formatMeetingTitle(miss.title)}</span>
                {` (${formatDate(miss.startsAt)}): due ${formatDate(miss.postBy)}, `}
                {miss.noticePostedAt ? `recorded ${formatDate(miss.noticePostedAt)}` : 'not recorded'}
              </li>
            ))}
            {more > 0 ? <li>and {more} more</li> : null}
          </ul>
        </div>
      ) : null}

      {summary.nextDue ? (
        <p className="text-content-secondary">
          Next notice due:{' '}
          <span className="font-medium text-content">{formatMeetingTitle(summary.nextDue.title)}</span>
          {`, by ${formatDate(summary.nextDue.postBy)}.`}
        </p>
      ) : null}

      {/* Notices are recorded on the meeting itself, not by uploading here. */}
      <Link
        href={`/communities/${communityId}/meetings`}
        className="inline-flex min-h-11 items-center font-medium text-interactive hover:underline md:min-h-0"
      >
        Record notices in Meetings
      </Link>
    </div>
  );
}
