/**
 * MeetingsBlockView — presentational half of the meetings block.
 *
 * Pure, synchronous, prop-driven. See `BlockViewProps` in ./types.
 */
import type { MeetingsBlockContent } from '@propertypro/shared';
import type { PublicMeeting } from '@/lib/db/public-community-reader';
import { Clock, MapPin, Users } from 'lucide-react';
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
        <ul className="space-y-4">
          {data.map((meeting) => {
            const tz = community.timezone;
            return (
              <li key={meeting.id} className="flex gap-4 rounded-md bg-surface-card p-4 site-sm:gap-6 site-sm:p-6">
                {/* A calendar page. Its colour comes from the look: a look that
                    sets dates in its accent colours this <time> (SiteChrome). */}
                <time
                  dateTime={meeting.startsAt.toISOString()}
                  className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-md border border-edge text-content site-sm:h-20 site-sm:w-20"
                >
                  <span className="text-sm font-semibold">
                    {formatPart(meeting.startsAt, tz, { month: 'short' })}
                  </span>
                  <span className="font-heading text-3xl leading-none site-sm:text-4xl">
                    {formatPart(meeting.startsAt, tz, { day: 'numeric' })}
                  </span>
                </time>
                <div className="min-w-0 self-center">
                  <h3 className="text-lg font-semibold leading-snug text-content site-sm:text-xl">{meeting.title}</h3>
                  <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-base text-content-secondary">
                    <li className="inline-flex items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {formatPart(meeting.startsAt, tz, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}
                    </li>
                    {meeting.location && (
                      <li className="inline-flex items-center gap-2">
                        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {meeting.location}
                      </li>
                    )}
                    <li className="inline-flex items-center gap-2">
                      <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {formatMeetingType(meeting.meetingType)}
                    </li>
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SiteSection>
  );
}
