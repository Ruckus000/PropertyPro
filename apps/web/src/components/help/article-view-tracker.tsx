'use client';

import { useTrackArticleView } from '@/hooks/use-help';

interface ArticleViewTrackerProps {
  communityId: number;
  articleSlug: string;
  articleCategory: string;
}

/**
 * Logs a best-effort help article view on mount.
 *
 * - Best-effort only — failures are swallowed.
 * - Uses a ref guard to avoid duplicate posts under React strict-mode double-render.
 */
export function ArticleViewTracker({
  communityId,
  articleSlug,
  articleCategory,
}: ArticleViewTrackerProps) {
  useTrackArticleView({ communityId, articleSlug, articleCategory });

  return null;
}
