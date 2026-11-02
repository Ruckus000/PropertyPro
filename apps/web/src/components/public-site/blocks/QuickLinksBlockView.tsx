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
import { formatInZone } from './format-in-zone';

export interface QuickLinksData {
  /** The next meeting the Meetings section lists, as an ISO timestamp; null when there is none. */
  nextMeeting: { startsAt: string } | null;
  showMeetings: boolean;
  showNews: boolean;
  showContact: boolean;
}

/** "Tue, Nov 17". */
const NEXT_MEETING_OPTS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
};

const LINK_CLASS =
  'flex min-h-11 items-start gap-4 rounded-md py-6 text-content-inverse transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-content-inverse site-md:px-6';

function QuickLink({
  href,
  icon: Icon,
  label,
  describedBy,
  children,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  /** The id of a hint a reader should hear after the name, as the link's description. */
  describedBy?: string;
  children: ReactNode;
}) {
  return (
    <li>
      {/* A plain <a>, not next/link: the public site ships no client runtime. */}
      <a href={href} className={LINK_CLASS} aria-describedby={describedBy}>
        <Icon className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="flex flex-col gap-1">
          <span className="text-base font-semibold">{label}</span>
          {children}
        </span>
      </a>
    </li>
  );
}

/**
 * A line under a link's name. It is left out of the name, so assistive tech hears
 * "News", not "News Notices from the board"; a hint that adds something (the
 * sign-in) is still heard, as the link's description (`describedBy`).
 */
function Hint({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <span id={id} className="text-base" aria-hidden="true">
      {children}
    </span>
  );
}

export type QuickLinksBlockViewProps = BlockViewProps<QuicklinksBlockContent, QuickLinksData>;

/**
 * Drawn as a band in the theme's primary colour right under the welcome: the
 * things a resident comes for first, with the next meeting's date set large.
 * `data-band` keeps the look's section tint and accent rules off it (SiteChrome).
 */
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
      data-band="primary"
      className="bg-primary px-6 site-sm:px-8 site-lg:px-10"
      aria-labelledby={headingId}
    >
      <div className="mx-auto max-w-6xl">
        <h2 id={headingId} className="sr-only">
          Quick links
        </h2>
        <ul className="grid divide-y divide-white/20 site-sm:grid-cols-2 site-sm:divide-y-0 site-md:-mx-6 site-md:grid-cols-4 site-md:divide-x">
          {data.showMeetings && (
            <QuickLink href="#meetings" icon={Calendar} label="Meetings">
              {next ? (
                <span className="font-heading text-2xl leading-tight">
                  <span className="sr-only">Next: </span>
                  <time dateTime={next.iso}>{formatInZone(next.date, community.timezone, NEXT_MEETING_OPTS)}</time>
                </span>
              ) : (
                <Hint>Dates and places</Hint>
              )}
            </QuickLink>
          )}
          {data.showNews && (
            <QuickLink href="#announcements" icon={Megaphone} label="News">
              <Hint>Notices from the board</Hint>
            </QuickLink>
          )}
          <QuickLink href="/auth/login" icon={Lock} label="Owner documents" describedBy={`${headingId}-sign-in`}>
            <Hint id={`${headingId}-sign-in`}>Sign in to read the records</Hint>
          </QuickLink>
          {data.showContact && (
            <QuickLink href="#contact" icon={Phone} label="Contact">
              <Hint>Office and management</Hint>
            </QuickLink>
          )}
        </ul>
      </div>
    </section>
  );
}
