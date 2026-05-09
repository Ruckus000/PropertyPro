/**
 * Help article view-tracking service.
 *
 * Wraps the `help_article_views` table so route handlers don't import the
 * table directly (Plan A3 third-boundary-guard compliance — see
 * `docs/audits/a3-third-boundary-guard-survey-2026-05-08.md`).
 *
 * Invariants:
 * - Append-only: views are never deduplicated on the server. If we want
 *   distinct view counts later, compute them at read time.
 * - Best-effort: the writer side (`recordArticleView`) is meant to be fire
 *   and forget; routes never block content delivery on tracking.
 *
 * Companion to:
 *   - apps/web/src/app/api/v1/help/view/route.ts (writer)
 *   - apps/web/src/app/api/v1/help/views/route.ts (reader)
 */
import { createScopedClient, helpArticleViews } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

export interface RecordArticleViewInput {
  communityId: number;
  userId: string;
  articleSlug: string;
  articleCategory: string;
}

/**
 * Record an append-only view event for analytics. Best-effort — caller may
 * fire-and-forget. Throws only on database errors; the route layer is
 * expected to swallow failures so content delivery isn't blocked on
 * tracking.
 */
export async function recordArticleView(
  input: RecordArticleViewInput,
): Promise<void> {
  const scoped = createScopedClient(input.communityId);
  await scoped.insert(helpArticleViews, {
    userId: input.userId,
    articleSlug: input.articleSlug,
    articleCategory: input.articleCategory,
  });
}

/**
 * Distinct article slugs the given user has ever viewed in this community.
 *
 * `help_article_views` is append-only (one row per view event), so the
 * service de-dupes in JS. The list is naturally bounded by the help-article
 * corpus size (~50 articles in 2026-05); per-user view sets are small.
 */
export async function listViewedArticleSlugs(
  communityId: number,
  userId: string,
): Promise<string[]> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    helpArticleViews,
    { articleSlug: helpArticleViews.articleSlug },
    eq(helpArticleViews.userId, userId),
  )) as Array<{ articleSlug: string }>;

  return Array.from(new Set(rows.map((row) => row.articleSlug)));
}
