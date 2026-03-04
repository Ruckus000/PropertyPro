import type { CommunityTheme } from '@propertypro/theme';
import type { AnnouncementsBlockContent } from '@propertypro/shared';
import { createScopedClient } from '@propertypro/db';
import { announcements } from '@propertypro/db';
import { desc, isNull } from '@propertypro/db/filters';

interface AnnouncementsBlockProps {
  content: Record<string, unknown>;
  communityId: number;
  theme: CommunityTheme;
}

/**
 * Announcements block — server component that queries recent announcements
 * for the community and renders them as a list.
 */
export async function AnnouncementsBlock({
  content,
  communityId,
  theme,
}: AnnouncementsBlockProps) {
  const c = content as unknown as AnnouncementsBlockContent;
  const limit = c.limit ?? 5;
  const title = c.title ?? 'Recent Announcements';

  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom(
    announcements,
    {
      id: announcements.id,
      title: announcements.title,
      body: announcements.body,
      publishedAt: announcements.publishedAt,
    },
    isNull(announcements.archivedAt),
  );

  // Apply ordering and limit manually since selectFrom returns a dynamic builder
  const items = await (rows as unknown as { orderBy: (col: ReturnType<typeof desc>) => { limit: (n: number) => Promise<Array<{ id: number; title: string; body: string; publishedAt: Date }>> } })
    .orderBy(desc(announcements.publishedAt))
    .limit(limit);

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
          <p className="text-gray-500">No announcements at this time.</p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <article
                key={item.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
              >
                <h3
                  className="text-lg font-semibold text-gray-900 mb-1"
                  style={{ fontFamily: `'${theme.fontHeading}', sans-serif` }}
                >
                  {item.title}
                </h3>
                <time
                  className="text-sm text-gray-500 block mb-2"
                  dateTime={item.publishedAt.toISOString()}
                >
                  {item.publishedAt.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
                <div
                  className="text-gray-700 line-clamp-3"
                  style={{ fontFamily: `'${theme.fontBody}', sans-serif` }}
                  dangerouslySetInnerHTML={{
                    __html: truncateHtml(item.body, 200),
                  }}
                />
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Simple HTML truncation that strips tags and limits to maxLength characters.
 * For public display only — keeps plain text safe.
 */
function truncateHtml(html: string, maxLength: number): string {
  // Strip HTML tags for plain text preview
  const text = html.replace(/<[^>]*>/g, '');
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '...';
}
