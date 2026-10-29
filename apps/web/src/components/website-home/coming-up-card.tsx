/**
 * The website home's "Coming up" (spec C2): meetings in the next 90 days, and
 * whether each one's notice has been marked posted.
 *
 * That mark is the manager's own attestation in Meetings
 * (`meetings.notice_posted_at`): a notice also has to go up on the property,
 * which PropertyPro cannot see, so nothing here stamps it. Each row links to
 * Meetings, where it is marked.
 */
import Link from 'next/link';
import { CircleCheck, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TOUCH } from './touch';

export interface ComingUpCardProps {
  communityId: number;
  meetings: Array<{ id: number; title: string; startsAt: string; noticePosted: boolean }>;
  /** Formats a meeting's start, in the community's time zone. */
  formatDateTime: (iso: string) => string;
}

export function ComingUpCard({ communityId, meetings, formatDateTime }: ComingUpCardProps) {
  const meetingsHref = `/communities/${communityId}/meetings`;
  return (
    <section
      aria-labelledby="coming-up-heading"
      className="space-y-3 rounded-md border border-edge bg-surface-card p-5"
    >
      <h2 id="coming-up-heading" className="text-lg font-semibold text-content">
        Coming up
      </h2>
      {meetings.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-content-secondary">No meetings in the next 90 days.</p>
          <Link
            href={meetingsHref}
            className={cn('inline-flex items-center text-sm font-medium text-content-link underline', TOUCH)}
          >
            Go to Meetings
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-edge-subtle">
          {meetings.map((meeting) => (
            <li key={meeting.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-content">{meeting.title}</p>
              <p className="text-sm text-content-secondary">
                <time dateTime={meeting.startsAt}>{formatDateTime(meeting.startsAt)}</time>
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {meeting.noticePosted ? (
                  <p className="flex items-center gap-1.5 text-sm text-status-success">
                    <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
                    Notice marked posted
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-sm text-status-warning">
                    <Clock className="size-4 shrink-0" aria-hidden="true" />
                    Notice not marked posted yet
                  </p>
                )}
                <Link
                  href={meetingsHref}
                  aria-label={`Open ${meeting.title} in Meetings`}
                  className={cn('inline-flex items-center text-sm font-medium text-content-link underline', TOUCH)}
                >
                  Open in Meetings
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
