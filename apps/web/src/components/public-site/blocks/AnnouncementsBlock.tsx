/**
 * AnnouncementsBlock — SoR block that reads published community announcements.
 *
 * Async server component. Validates block.content via announcementsBlockSchema
 * (defense-in-depth), fetches via getPublicCommunityScopedReader, and sanitizes
 * HTML bodies before rendering.
 */
import { announcementsBlockSchema, type AnnouncementsBlockContent } from '@propertypro/shared';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { sanitizeHtml } from '@/lib/utils/html-sanitizer';
import type { BlockRendererProps } from './types';

function formatDate(value: Date, timezone: string): string {
  const tz = timezone || 'America/New_York';
  try {
    return value.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: tz,
    });
  } catch {
    // Invalid/unsupported timezone (e.g., legacy bad data in
    // communities.timezone). Fall back to the default zone rather than
    // crashing the whole block.
    return value.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/New_York',
    });
  }
}

export async function AnnouncementsBlock(props: BlockRendererProps) {
  const parsed = announcementsBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    console.warn(
      'announcements block content failed Zod validation; skipping render',
      { blockId: props.block.id, communityId: props.community.id, issues: parsed.error.issues },
    );
    return null;
  }
  const config: AnnouncementsBlockContent = parsed.data;
  const reader = getPublicCommunityScopedReader(props.community.id);
  const items = await reader.listAnnouncements({ limit: config.limit, timeWindowDays: config.timeWindowDays });

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8" aria-labelledby={`announcements-${props.block.id}`}>
      <div className="mx-auto max-w-3xl">
        <h2 id={`announcements-${props.block.id}`} className="font-heading text-2xl font-semibold text-content mb-6">
          Announcements
        </h2>
        {items.length === 0 ? (
          <p className="rounded-md border border-default bg-surface-card p-4 text-sm text-content-secondary">
            No announcements yet.
          </p>
        ) : (
          <ul className="space-y-4">
            {items.map((item) => (
              <li key={item.id} className="rounded-md border border-default bg-surface-card p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-lg font-medium text-content">
                    {item.isPinned && <span className="text-xs font-semibold uppercase tracking-wide text-accent mr-2">Pinned</span>}
                    {item.title}
                  </h3>
                  <time className="text-xs text-content-secondary whitespace-nowrap" dateTime={item.publishedAt.toISOString()}>
                    {formatDate(item.publishedAt, props.community.timezone)}
                  </time>
                </div>
                <div
                  className="mt-3 text-sm text-content prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.body ?? '') }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
