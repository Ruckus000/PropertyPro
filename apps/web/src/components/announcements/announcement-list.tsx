import type { Announcement } from '@propertypro/db';
import Link from 'next/link';
import { Pin } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';

interface AnnouncementListProps {
  items: Announcement[];
  communityId: number;
  canWriteAnnouncements?: boolean;
}

/**
 * Strip HTML tags and decode common entities to produce plain text.
 *
 * On the client we delegate to the DOM (handles all edge cases).
 * On the server we use a small state-machine parser that correctly
 * handles `>` characters inside quoted attribute values — something
 * a simple regex cannot do reliably.
 */
function stripHtml(html: string): string {
  if (typeof document !== 'undefined') {
    const el = document.createElement('div');
    el.innerHTML = html;
    return el.textContent ?? '';
  }

  // SSR fallback: state-machine tag stripper
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
      // Skip HTML comments entirely
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

  // Decode HTML entities — named entities first, then numeric (decimal & hex)
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

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function AnnouncementCard({
  item,
  communityId,
  canWriteAnnouncements,
}: {
  item: Announcement;
  communityId: number;
  canWriteAnnouncements: boolean;
}) {
  const detailHref = `/announcements/${item.id}?communityId=${communityId}`;
  const editHref = `/announcements/${item.id}/edit?communityId=${communityId}`;

  return (
    <article className="rounded-md border border-edge bg-surface-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-content">
              <Link href={detailHref} className="hover:text-interactive">
                {item.title}
              </Link>
            </h3>
            {item.isPinned && (
              <span className="inline-flex items-center gap-1 rounded-full bg-interactive-subtle px-2 py-0.5 text-xs font-semibold text-interactive">
                <Pin size={12} />
                Pinned
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-content-tertiary">{formatDate(item.publishedAt)}</p>
        </div>
      </div>
      {item.body && (
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-content-secondary">
          {stripHtml(item.body)}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={detailHref}>View details</Link>
        </Button>
        {canWriteAnnouncements ? (
          <Button asChild size="sm">
            <Link href={editHref}>Edit</Link>
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export function AnnouncementList({
  items,
  communityId,
  canWriteAnnouncements = false,
}: AnnouncementListProps) {
  const { pinned, unpinned } = items.reduce<{
    pinned: Announcement[];
    unpinned: Announcement[];
  }>(
    (acc, item) => {
      (item.isPinned ? acc.pinned : acc.unpinned).push(item);
      return acc;
    },
    { pinned: [], unpinned: [] },
  );

  if (items.length === 0) {
    return (
      <EmptyState
        icon="bell"
        title="No announcements yet"
        description={
          canWriteAnnouncements
            ? "Post your first announcement to keep residents informed."
            : "Announcements from your community will appear here."
        }
        action={
          canWriteAnnouncements ? (
            <Button asChild>
              <Link href={`/announcements/new?communityId=${communityId}`}>
                Create announcement
              </Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {pinned.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-content-tertiary">
            Pinned
          </h2>
          <div className="space-y-3">
            {pinned.map((item) => (
              <AnnouncementCard
                key={item.id}
                item={item}
                communityId={communityId}
                canWriteAnnouncements={canWriteAnnouncements}
              />
            ))}
          </div>
        </section>
      )}

      {unpinned.length > 0 && (
        <section>
          {pinned.length > 0 && (
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-content-tertiary">
              Recent
            </h2>
          )}
          <div className="space-y-3">
            {unpinned.map((item) => (
              <AnnouncementCard
                key={item.id}
                item={item}
                communityId={communityId}
                canWriteAnnouncements={canWriteAnnouncements}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
