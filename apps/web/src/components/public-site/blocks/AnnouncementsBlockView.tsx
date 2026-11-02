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
  return (
    <SiteSection id={anchorId} headingId={`announcements-${blockId}`} title="Announcements">
      {data.length === 0 ? (
        <SiteSectionEmpty>{content?.emptyText ?? 'No announcements yet.'}</SiteSectionEmpty>
      ) : (
        <ul className="divide-y divide-edge border-y border-edge">
          {data.map((item) => (
            <li key={item.id} className="py-6">
              <time
                className="text-sm text-content-secondary"
                dateTime={item.publishedAt.toISOString()}
              >
                {formatDate(item.publishedAt, community.timezone)}
              </time>
              <h3 className="mt-1 text-xl font-semibold text-content">
                {item.isPinned && (
                  <span className="mr-2 text-sm font-semibold uppercase tracking-widest text-accent">
                    Pinned
                  </span>
                )}
                {item.title}
              </h3>
              <div
                className="prose mt-2 max-w-prose text-base text-content"
                dangerouslySetInnerHTML={{ __html: item.bodyHtml }}
              />
            </li>
          ))}
        </ul>
      )}
    </SiteSection>
  );
}
