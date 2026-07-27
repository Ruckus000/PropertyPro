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
}: AnnouncementsBlockViewProps) {
  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8" aria-labelledby={`announcements-${blockId}`}>
      <div className="mx-auto max-w-3xl">
        <h2
          id={`announcements-${blockId}`}
          className="font-heading text-2xl font-semibold text-content mb-6"
        >
          Announcements
        </h2>
        {data.length === 0 ? (
          <p className="rounded-md border border-default bg-surface-card p-4 text-sm text-content-secondary">
            {content?.emptyText ?? "No announcements yet."}
          </p>
        ) : (
          <ul className="space-y-4">
            {data.map((item) => (
              <li key={item.id} className="rounded-md border border-default bg-surface-card p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-lg font-medium text-content">
                    {item.isPinned && (
                      <span className="text-xs font-semibold uppercase tracking-wide text-accent mr-2">
                        Pinned
                      </span>
                    )}
                    {item.title}
                  </h3>
                  <time
                    className="text-xs text-content-secondary whitespace-nowrap"
                    dateTime={item.publishedAt.toISOString()}
                  >
                    {formatDate(item.publishedAt, community.timezone)}
                  </time>
                </div>
                <div
                  className="mt-3 text-sm text-content prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: item.bodyHtml }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
