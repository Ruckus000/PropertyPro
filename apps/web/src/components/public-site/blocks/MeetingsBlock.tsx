/**
 * MeetingsBlock — SoR block that reads upcoming community meetings.
 *
 * Async server component. Validates block.content via meetingsBlockSchema
 * (defense-in-depth), fetches via getPublicCommunityScopedReader, and
 * renders a list of upcoming meetings ordered by start time.
 *
 * Dates are formatted in the community's configured timezone. The reader
 * filters to meetings with startsAt >= now() and within the configured
 * timeWindowDays.
 */
import { meetingsBlockSchema, type MeetingsBlockContent } from '@propertypro/shared';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import type { BlockRendererProps } from './types';

function formatDateTime(value: Date, timezone: string): string {
  return value.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone || 'America/New_York',
    timeZoneName: 'short',
  });
}

/** Capitalises the first letter and replaces underscores with spaces. */
function formatMeetingType(meetingType: string): string {
  return meetingType.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export async function MeetingsBlock(props: BlockRendererProps) {
  const parsed = meetingsBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    console.warn(
      'meetings block content failed Zod validation; skipping render',
      { blockId: props.block.id, communityId: props.community.id, issues: parsed.error.issues },
    );
    return null;
  }
  const config: MeetingsBlockContent = parsed.data;
  const reader = getPublicCommunityScopedReader(props.community.id);
  const items = await reader.listMeetings({
    limit: config.limit,
    timeWindowDays: config.timeWindowDays,
  });

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8" aria-labelledby={`meetings-${props.block.id}`}>
      <div className="mx-auto max-w-3xl">
        <h2 id={`meetings-${props.block.id}`} className="font-heading text-2xl font-semibold text-content mb-6">
          Upcoming Meetings
        </h2>
        {items.length === 0 ? (
          <p className="rounded-md border border-default bg-surface-card p-4 text-sm text-content-secondary">
            No upcoming meetings.
          </p>
        ) : (
          <ul className="space-y-4">
            {items.map((meeting) => (
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
                        {formatDateTime(meeting.startsAt, props.community.timezone)}
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
