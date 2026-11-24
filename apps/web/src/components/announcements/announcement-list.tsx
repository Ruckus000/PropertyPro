'use client';

/**
 * The records of the announcements list, on the page kit: "Pinned" and
 * "Recent" sections of rows. A row's title opens the announcement; Edit,
 * Delete and Restore live on that page, not here. A client component so the
 * preview text is built with the browser's inert DOMParser (see `stripHtml`).
 */
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { RecordList, RecordRow } from '@propertypro/ui/components/shared/record-row';
import { Section, SectionFooter, SectionHeader } from '@propertypro/ui/components/shared/section';
import { StatusGlyph } from '@propertypro/ui/components/shared/status-glyph';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { formatShortDate } from '@/lib/utils/format-date';
import { AnnouncementsFirstPost, AnnouncementsWaiting } from './announcements-empty';

export interface AnnouncementListItem {
  id: number;
  communityId: number;
  title: string;
  body: string;
  audience: string;
  isPinned: boolean;
  publishedAt: string | Date;
  deletedAt: string | Date | null;
}

export interface AnnouncementListProps {
  items: AnnouncementListItem[];
  communityId: number;
  /** Deleted rows are listed (admins, `?includeDeleted=true`). */
  showDeleted: boolean;
  /** The viewer can post: an empty list shows the first-post guide, not the waiting state. */
  canWrite?: boolean;
  /**
   * The `?q=` search the list was filtered by, if any. An empty list under a
   * search means "nothing matched", not "nothing posted", so it gets its own
   * message naming the search.
   */
  searchQuery?: string;
  /** Where "Clear search" goes; shown in the no-results state. */
  clearSearchHref?: string;
}

export function stripHtml(html: string): string {
  if (typeof DOMParser !== 'undefined') {
    // An inert document: unlike innerHTML on an element of the live page, it
    // runs no handlers and loads nothing (an <img onerror> stays dormant).
    return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
  }
  let result = '';
  let inTag = false;
  let quote: string | null = null;
  for (let i = 0; i < html.length; i++) {
    const ch = html[i];
    if (inTag) {
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        inTag = false;
      }
    } else if (ch === '<') {
      if (html.substring(i + 1, i + 4) === '!--') {
        const commentEnd = html.indexOf('-->', i + 4);
        if (commentEnd !== -1) {
          i = commentEnd + 2;
          continue;
        }
      }
      inTag = true;
    } else {
      result += ch;
    }
  }
  return result
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
}

function AnnouncementRow({ item, communityId }: { item: AnnouncementListItem; communityId: number }) {
  const deleted = item.deletedAt != null;
  const word = deleted ? 'Deleted' : 'Published';
  return (
    <RecordRow
      lead={<StatusGlyph kind={deleted ? 'not-started' : 'done'} label={word} hideLabel />}
      title={
        <Link
          href={`/announcements/${item.id}?communityId=${communityId}`}
          className="inline-flex min-h-11 max-w-full items-center text-content-link hover:underline md:min-h-0"
        >
          <span className="truncate">{item.title}</span>
        </Link>
      }
      statusWord={word}
      // Every reader sees the board-only mark, so a board seat knows not to share the post.
      meta={[item.audience === 'board_only' ? 'Board only' : '', formatShortDate(item.publishedAt)]}
      preview={item.body ? stripHtml(item.body) : undefined}
    />
  );
}

function AnnouncementGroup({
  title,
  items,
  communityId,
}: {
  /** Omitted when the list is one group: the page title already says what it is. */
  title?: string;
  items: AnnouncementListItem[];
  communityId: number;
}) {
  return (
    <Section>
      {title ? <SectionHeader title={title} /> : null}
      <RecordList>
        {items.map((item) => (
          <AnnouncementRow key={item.id} item={item} communityId={communityId} />
        ))}
      </RecordList>
      <SectionFooter note={`Showing ${items.length}`} />
    </Section>
  );
}

export function AnnouncementList({
  items,
  communityId,
  showDeleted,
  canWrite = false,
  searchQuery,
  clearSearchHref,
}: AnnouncementListProps) {
  const visibleItems = showDeleted ? items : items.filter((item) => item.deletedAt == null);

  if (visibleItems.length === 0 && searchQuery) {
    return (
      <Section>
        <EmptyState
          icon={SearchX}
          title={`No announcements match “${searchQuery}”`}
          description="Try a different word, or clear the search to see every announcement."
          action={
            clearSearchHref ? (
              <Button asChild variant="outline">
                <Link href={clearSearchHref}>Clear search</Link>
              </Button>
            ) : undefined
          }
        />
      </Section>
    );
  }
  if (visibleItems.length === 0 && showDeleted) {
    return (
      <Section>
        <EmptyState
          icon="bell"
          title="No deleted announcements"
          description="Deleted announcements show up here. Admins can restore them."
        />
      </Section>
    );
  }
  if (visibleItems.length === 0) {
    return canWrite ? (
      <AnnouncementsFirstPost communityId={communityId} />
    ) : (
      <AnnouncementsWaiting communityId={communityId} />
    );
  }

  const pinned = visibleItems.filter((item) => item.isPinned);
  const unpinned = visibleItems.filter((item) => !item.isPinned);

  return (
    <div className="flex flex-col gap-5">
      {pinned.length > 0 ? (
        <AnnouncementGroup title="Pinned" items={pinned} communityId={communityId} />
      ) : null}
      {unpinned.length > 0 ? (
        <AnnouncementGroup
          title={pinned.length > 0 ? 'Recent' : undefined}
          items={unpinned}
          communityId={communityId}
        />
      ) : null}
    </div>
  );
}
