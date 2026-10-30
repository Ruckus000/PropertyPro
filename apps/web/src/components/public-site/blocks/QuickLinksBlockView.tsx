/**
 * QuickLinksBlockView — presentational half of the Quick links section.
 *
 * Pure, synchronous, prop-driven. See `BlockViewProps` in ./types.
 *
 * Up to four shortcuts, in this order: Meetings (with the next meeting's date),
 * News, Owner documents and Contact. Owner documents always shows: it is the
 * sign-in owners use to reach the association's records. The other three show
 * only when `data` says so; on the public site the shell decides that from the
 * page's own sections, so a link never lands on nothing (see QuickLinksBlock).
 *
 * The section has no visible heading, as a row of shortcuts reads without one;
 * the `<h2>` is there for assistive tech and names the region.
 */
import type { ReactNode } from 'react';
import { Calendar, Lock, Megaphone, Phone, type LucideIcon } from 'lucide-react';
import type { QuicklinksBlockContent } from '@propertypro/shared';
import type { BlockViewProps } from './types';

export interface QuickLinksData {
  /** The next meeting the Meetings section lists, as an ISO timestamp; null when there is none. */
  nextMeeting: { startsAt: string } | null;
  showMeetings: boolean;
  showNews: boolean;
  showContact: boolean;
}

const NEXT_MEETING_OPTS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
};

/** "Tue, Nov 17", in the community's time zone, falling back as the Meetings view does. */
function formatNextMeeting(value: Date, timezone: string): string {
  try {
    return value.toLocaleDateString('en-US', {
      ...NEXT_MEETING_OPTS,
      timeZone: timezone || 'America/New_York',
    });
  } catch {
    // Invalid timezone (legacy DB data); fall back to default.
    return value.toLocaleDateString('en-US', { ...NEXT_MEETING_OPTS, timeZone: 'America/New_York' });
  }
}

const LINK_CLASS =
  'flex min-h-11 items-center gap-3 rounded-md border border-edge bg-surface-card px-4 py-3 text-base text-content transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive';

function QuickLink({
  href,
  icon: Icon,
  label,
  children,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  children?: ReactNode;
}) {
  return (
    <li>
      {/* A plain <a>, not next/link: the public site ships no client runtime. */}
      <a href={href} className={LINK_CLASS}>
        <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="flex flex-col">
          <span className="font-medium">{label}</span>
          {children}
        </span>
      </a>
    </li>
  );
}

export type QuickLinksBlockViewProps = BlockViewProps<QuicklinksBlockContent, QuickLinksData>;

export function QuickLinksBlockView({ blockId, data, community, anchorId }: QuickLinksBlockViewProps) {
  const headingId = `quicklinks-${blockId}`;
  const { nextMeeting } = data;
  const nextDate = nextMeeting ? new Date(nextMeeting.startsAt) : null;
  // A date that does not parse is left out rather than shown as "Invalid Date".
  const next = nextMeeting && nextDate && !Number.isNaN(nextDate.getTime())
    ? { iso: nextMeeting.startsAt, date: nextDate }
    : null;

  return (
    <section
      id={anchorId}
      className="px-4 py-8 site-sm:px-6 site-lg:px-8"
      aria-labelledby={headingId}
    >
      <div className="mx-auto max-w-3xl">
        <h2 id={headingId} className="sr-only">
          Quick links
        </h2>
        <ul className="grid gap-3 site-sm:grid-cols-2">
          {data.showMeetings && (
            <QuickLink href="#meetings" icon={Calendar} label="Meetings">
              {next && (
                <span className="text-content-secondary">
                  {'Next: '}
                  <time dateTime={next.iso}>{formatNextMeeting(next.date, community.timezone)}</time>
                </span>
              )}
            </QuickLink>
          )}
          {data.showNews && <QuickLink href="#announcements" icon={Megaphone} label="News" />}
          <QuickLink href="/auth/login" icon={Lock} label="Owner documents" />
          {data.showContact && <QuickLink href="#contact" icon={Phone} label="Contact" />}
        </ul>
      </div>
    </section>
  );
}
