/**
 * MeetingsBlockView — presentational half of the meetings block.
 *
 * Pure, synchronous, prop-driven. See `BlockViewProps` in ./types.
 */
import type { MeetingsBlockContent } from '@propertypro/shared';
import type { PublicMeeting } from '@/lib/db/public-community-reader';
import type { BlockViewProps } from './types';
import { SiteSection, SiteSectionEmpty } from './SiteSection';

/**
 * One part of a meeting's start, in the community's own time zone. An invalid
 * zone (legacy data) falls back to Eastern rather than breaking the section.
 */
function formatPart(value: Date, timezone: string, opts: Intl.DateTimeFormatOptions): string {
  try {
    return value.toLocaleString('en-US', { ...opts, timeZone: timezone || 'America/New_York' });
  } catch {
    return value.toLocaleString('en-US', { ...opts, timeZone: 'America/New_York' });
  }
}

/** Capitalises the first letter and replaces underscores with spaces. */
function formatMeetingType(meetingType: string): string {
  return meetingType.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export type MeetingsBlockViewProps = BlockViewProps<MeetingsBlockContent, PublicMeeting[]>;

export function MeetingsBlockView({
  content,
  blockId,
  data,
  community,
  anchorId,
}: MeetingsBlockViewProps) {
  return (
    <SiteSection id={anchorId} headingId={`meetings-${blockId}`} title="Upcoming Meetings">
      {data.length === 0 ? (
        <SiteSectionEmpty>{content?.emptyText ?? 'No upcoming meetings.'}</SiteSectionEmpty>
      ) : (
        <ul className="divide-y divide-edge border-y border-edge">
          {data.map((meeting) => {
            const tz = community.timezone;
            const details = [
              formatMeetingType(meeting.meetingType),
              formatPart(meeting.startsAt, tz, { hour: 'numeric', minute: '2-digit' }),
              meeting.location,
            ].filter(Boolean);
            return (
              <li key={meeting.id} className="flex gap-6 py-6">
                {/* The date column. Its colour comes from the look: a look that
                    sets dates in its accent colours this <time> (SiteChrome). */}
                <time
                  dateTime={meeting.startsAt.toISOString()}
                  className="flex w-14 shrink-0 flex-col items-center text-content"
                >
                  <span className="text-sm font-semibold uppercase tracking-widest">
                    {formatPart(meeting.startsAt, tz, { month: 'short' })}
                  </span>
                  <span className="font-heading text-4xl leading-none">
                    {formatPart(meeting.startsAt, tz, { day: 'numeric' })}
                  </span>
                </time>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-content">{meeting.title}</h3>
                  <p className="mt-1 text-base text-content-secondary">{details.join(' · ')}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SiteSection>
  );
}
