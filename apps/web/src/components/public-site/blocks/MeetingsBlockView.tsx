/**
 * MeetingsBlockView — presentational half of the meetings block.
 *
 * Pure, synchronous, prop-driven. See `BlockViewProps` in ./types.
 */
import type { MeetingsBlockContent } from '@propertypro/shared';
import type { PublicMeeting } from '@/lib/db/public-community-reader';
import type { BlockViewProps } from './types';

const DATE_TIME_OPTS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

function formatDateTime(value: Date, timezone: string): string {
  try {
    return value.toLocaleString('en-US', {
      ...DATE_TIME_OPTS,
      timeZone: timezone || 'America/New_York',
    });
  } catch {
    // Invalid timezone (legacy DB data); fall back to default.
    return value.toLocaleString('en-US', { ...DATE_TIME_OPTS, timeZone: 'America/New_York' });
  }
}

/** Capitalises the first letter and replaces underscores with spaces. */
function formatMeetingType(meetingType: string): string {
  return meetingType.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export type MeetingsBlockViewProps = BlockViewProps<MeetingsBlockContent, PublicMeeting[]>;

export function MeetingsBlockView({ blockId, data, community }: MeetingsBlockViewProps) {
  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8" aria-labelledby={`meetings-${blockId}`}>
      <div className="mx-auto max-w-3xl">
        <h2
          id={`meetings-${blockId}`}
          className="font-heading text-2xl font-semibold text-content mb-6"
        >
          Upcoming Meetings
        </h2>
        {data.length === 0 ? (
          <p className="rounded-md border border-default bg-surface-card p-4 text-sm text-content-secondary">
            No upcoming meetings.
          </p>
        ) : (
          <ul className="space-y-4">
            {data.map((meeting) => (
              <li key={meeting.id} className="rounded-md border border-default bg-surface-card p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <h3 className="text-lg font-medium text-content">{meeting.title}</h3>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-content-secondary">
                        {formatMeetingType(meeting.meetingType)}
                      </span>
                    </div>
                  </div>
                </div>
                <dl className="mt-3 space-y-1 text-sm text-content-secondary">
                  <div className="flex items-baseline gap-2">
                    <dt className="font-medium text-content-secondary shrink-0">When</dt>
                    <dd>
                      <time dateTime={meeting.startsAt.toISOString()}>
                        {formatDateTime(meeting.startsAt, community.timezone)}
                      </time>
                    </dd>
                  </div>
                  {meeting.location && (
                    <div className="flex items-baseline gap-2">
                      <dt className="font-medium text-content-secondary shrink-0">Where</dt>
                      <dd>{meeting.location}</dd>
                    </div>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
