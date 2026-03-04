import type { CommunityTheme } from '@propertypro/theme';
import type { MeetingsBlockContent } from '@propertypro/shared';
import { createScopedClient } from '@propertypro/db';
import { meetings } from '@propertypro/db';
import { asc, gte } from '@propertypro/db/filters';

interface MeetingsBlockProps {
  content: Record<string, unknown>;
  communityId: number;
  theme: CommunityTheme;
}

/**
 * Meetings block — server component that queries upcoming meetings
 * and renders them as a timeline-style list.
 */
export async function MeetingsBlock({
  content,
  communityId,
  theme,
}: MeetingsBlockProps) {
  const c = content as unknown as MeetingsBlockContent;
  const title = c.title ?? 'Upcoming Meetings';

  const scoped = createScopedClient(communityId);
  const now = new Date();

  const items = await scoped.selectFrom(
    meetings,
    {
      id: meetings.id,
      title: meetings.title,
      meetingType: meetings.meetingType,
      startsAt: meetings.startsAt,
      location: meetings.location,
    },
    gte(meetings.startsAt, now),
  )
    .orderBy(asc(meetings.startsAt))
    .limit(5) as unknown as Array<{
    id: number;
    title: string;
    meetingType: string;
    startsAt: Date;
    location: string;
  }>;

  return (
    <section className="w-full py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <h2
          className="text-2xl font-bold mb-6"
          style={{
            color: theme.primaryColor,
            fontFamily: `'${theme.fontHeading}', sans-serif`,
          }}
        >
          {title}
        </h2>
        {items.length === 0 ? (
          <p className="text-gray-500">No upcoming meetings scheduled.</p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex gap-4 border-l-4 pl-4 py-2"
                style={{ borderColor: theme.primaryColor }}
              >
                <div className="flex-shrink-0 text-center min-w-[3.5rem]">
                  <div
                    className="text-sm font-semibold uppercase"
                    style={{ color: theme.primaryColor }}
                  >
                    {new Date(item.startsAt).toLocaleDateString('en-US', { month: 'short' })}
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {new Date(item.startsAt).toLocaleDateString('en-US', { day: 'numeric' })}
                  </div>
                </div>
                <div>
                  <h3
                    className="font-semibold text-gray-900"
                    style={{ fontFamily: `'${theme.fontHeading}', sans-serif` }}
                  >
                    {item.title}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {new Date(item.startsAt).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}{' '}
                    &middot; {item.location}
                  </p>
                  <span
                    className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700 capitalize"
                  >
                    {item.meetingType.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
