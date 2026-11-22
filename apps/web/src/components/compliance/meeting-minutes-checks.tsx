/**
 * What decided a minutes checklist row: which held board meetings have posted
 * minutes, which do not or went up late, and which are awaiting approval.
 * Rendered like `MeetingNoticeChecks`, from the same summary shape.
 *
 * States what was recorded and when. It does not judge whether minutes were
 * properly approved — PropertyPro does not give legal advice.
 */
import Link from 'next/link';
import type { MeetingMinutesSummary } from '@/lib/compliance/meeting-minutes-status';
import { formatMeetingTitle } from '@/lib/utils/format-meeting-title';

/** How many missed minutes to name before summarising the rest. */
const MISSED_SHOWN = 5;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function MeetingMinutesChecks({
  summary,
  communityId,
}: {
  summary: MeetingMinutesSummary;
  communityId: number;
}) {
  const shown = summary.missed.slice(0, MISSED_SHOWN);
  const more = summary.missed.length - shown.length;
  const ok = summary.missed.length === 0;

  return (
    <div className="my-4 space-y-3 border-y border-edge-subtle py-4 text-sm" data-testid="meeting-minutes-checks">
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
            Minutes posted on time: {summary.onTimeCount} of {summary.dueCount}
          </div>
          <div className="text-xs text-content-secondary">
            Scored from your board meetings over the past {summary.windowMonths} months. Minutes count
            once a later board meeting has been held, and are on time when posted within 30 days of
            the approval date recorded on them.
          </div>
        </div>
      </div>

      {shown.length > 0 ? (
        <div>
          <div className="font-semibold">Not posted or posted late</div>
          <ul className="mt-1 space-y-1 text-content-secondary">
            {shown.map((miss) => (
              <li key={miss.meetingId}>
                <span className="font-medium text-content">{formatMeetingTitle(miss.title)}</span>
                {` (${formatDate(miss.startsAt)}): `}
                {miss.reason === 'posted_late' && miss.postBy && miss.minutesPostedAt
                  ? `due ${formatDate(miss.postBy)}, posted ${formatDate(miss.minutesPostedAt)}`
                  : 'minutes not posted'}
              </li>
            ))}
            {more > 0 ? <li>and {more} more</li> : null}
          </ul>
        </div>
      ) : null}

      {summary.nextDue ? (
        <p className="text-content-secondary">
          Awaiting approval:{' '}
          <span className="font-medium text-content">{formatMeetingTitle(summary.nextDue.title)}</span>
          {` (${formatDate(summary.nextDue.startsAt)}).`}
        </p>
      ) : null}

      {/* Minutes are recorded on the meeting itself. */}
      <Link
        href={`/communities/${communityId}/meetings`}
        className="inline-flex min-h-11 items-center font-medium text-interactive hover:underline md:min-h-0"
      >
        Record minutes in Meetings
      </Link>
    </div>
  );
}
