/**
 * AnnouncementsBlockView — presentational half of the announcements block.
 *
 * Pure, synchronous, prop-driven: rendered by `AnnouncementsBlock` on the
 * public site and by the editor canvas with the same markup. See
 * `BlockViewProps` in ./types for why the split exists and what must stay true
 * of this file.
 */
import type { AnnouncementsBlockContent } from '@propertypro/shared';
import type { PublicAnnouncement } from '@/lib/db/public-community-reader';
import { Pin } from 'lucide-react';
import type { BlockViewProps } from './types';
import { SiteSection, SiteSectionEmpty } from './SiteSection';

/**
 * An announcement with its body already sanitized.
 *
 * Sanitization deliberately happens in the SHELL, not here. Two reasons:
 * it is a server concern (the write path sanitizes with the same helper), and
 * `isomorphic-dompurify` drags jsdom in behind it — importing it from a view
 * that the editor canvas renders client-side would put a very large dependency
 * into the editor bundle for no benefit.
 *
 * `bodyHtml` is therefore trusted by this component and must never be built
 * from raw user input at the call site.
 */
export interface AnnouncementViewItem extends PublicAnnouncement {
  bodyHtml: string;
}

function formatDate(value: Date, timezone: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  try {
    return value.toLocaleString('en-US', { ...opts, timeZone: timezone || 'America/New_York' });
  } catch {
    // Invalid/unsupported timezone (e.g. legacy bad data in
    // communities.timezone). Fall back to the default zone rather than
    // crashing the whole block.
    return value.toLocaleString('en-US', { ...opts, timeZone: 'America/New_York' });
  }
}

export type AnnouncementsBlockViewProps = BlockViewProps<
  AnnouncementsBlockContent,
  AnnouncementViewItem[]
>;

export function AnnouncementsBlockView({
  content,
  blockId,
  data,
  community,
  anchorId,
}: AnnouncementsBlockViewProps) {
  const [lead, ...rest] = data;
  const tz = community.timezone;

  return (
    <SiteSection
      id={anchorId}
      headingId={`announcements-${blockId}`}
      title="Announcements"
      layout="stacked"
    >
      {lead === undefined ? (
        <SiteSectionEmpty>{content?.emptyText ?? 'No announcements yet.'}</SiteSectionEmpty>
      ) : (
        <ul className="grid gap-12 site-md:grid-cols-3">
          {/* The newest notice (a pinned one comes first) leads, at reading size. */}
          <li className={rest.length > 0 ? 'site-md:col-span-2' : 'site-md:col-span-3'}>
            <Meta item={lead} timezone={tz} />
            <h3 className="mt-3 font-heading text-2xl font-semibold leading-snug text-content site-md:text-3xl">
              {lead.title}
            </h3>
            <div
              className="prose mt-4 max-w-prose text-lg leading-relaxed text-content"
              dangerouslySetInnerHTML={{ __html: lead.bodyHtml }}
            />
          </li>
          {rest.length > 0 && (
            <li className="site-md:border-l site-md:border-edge site-md:pl-12">
              <ul className="space-y-8">
                {rest.map((item) => (
                  <li key={item.id}>
                    <Meta item={item} timezone={tz} />
                    <h3 className="mt-2 text-lg font-semibold leading-snug text-content">{item.title}</h3>
                    <div
                      className="prose mt-2 text-base text-content-secondary"
                      dangerouslySetInnerHTML={{ __html: item.bodyHtml }}
                    />
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      )}
    </SiteSection>
  );
}

/** The notice's date, and whether the board pinned it. */
function Meta({ item, timezone }: { item: AnnouncementViewItem; timezone: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-content-secondary">
      <time dateTime={item.publishedAt.toISOString()}>{formatDate(item.publishedAt, timezone)}</time>
      {item.isPinned && (
        <span className="inline-flex items-center gap-1 font-semibold text-accent">
          <Pin className="h-4 w-4" aria-hidden="true" />
          Pinned
        </span>
      )}
    </p>
  );
}
