/**
 * Server-side helper for the help "read" checkmark UI.
 *
 * Returns the set of article slugs the given user has viewed in this
 * community, sourced from `help_article_views` (append-only, written by
 * <ArticleViewTracker> on article mount). Read state is purely advisory —
 * a fetch failure is swallowed and an empty set returned so the UI never
 * blocks on it.
 *
 * Use this from server components only. The client-side equivalent is the
 * `useReadArticles` hook in apps/web/src/hooks/use-help.ts; do not create
 * a parallel implementation.
 */
import { createScopedClient, helpArticleViews } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

export async function getReadArticleSlugs(
  communityId: number,
  userId: string,
): Promise<Set<string>> {
  try {
    const scoped = createScopedClient(communityId);
    const rows = (await scoped.selectFrom(
      helpArticleViews,
      { articleSlug: helpArticleViews.articleSlug },
      eq(helpArticleViews.userId, userId),
    )) as Array<{ articleSlug: string }>;
    return new Set(rows.map((row) => row.articleSlug));
  } catch {
    return new Set();
  }
}
