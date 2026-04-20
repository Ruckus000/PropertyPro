'use client';

import { useEffect, useRef } from 'react';

interface ArticleViewTrackerProps {
  communityId: number;
  articleSlug: string;
  articleCategory: string;
}

/**
 * Fires a POST to /api/v1/help/view on mount to log a page view.
 *
 * - Best-effort only — failures are swallowed.
 * - Uses a ref guard to avoid duplicate posts under React strict-mode double-render.
 */
export function ArticleViewTracker({
  communityId,
  articleSlug,
  articleCategory,
}: ArticleViewTrackerProps) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    void fetch('/api/v1/help/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ communityId, articleSlug, articleCategory }),
      keepalive: true,
    }).catch(() => {
      /* best-effort: ignore tracking failures */
    });
  }, [communityId, articleSlug, articleCategory]);

  return null;
}
