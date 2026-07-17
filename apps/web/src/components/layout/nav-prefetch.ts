import type { QueryClient } from '@tanstack/react-query';
import { prefetchDocuments } from '@/hooks/use-documents';

/**
 * Hover/focus DATA prefetch for the heaviest client-fetching nav targets.
 *
 * Next.js Link already prefetches the route (loading boundary) — this warms
 * the React Query cache so the destination page mounts with data instead of
 * firing its first fetch after hydration. Keep this map deliberately tiny:
 * only add targets whose initial query key is deterministic from the nav
 * href (no date ranges, no role-dependent views), so the prefetched entry is
 * exactly what the page's hook asks for.
 */
export function prefetchNavData(
  queryClient: QueryClient,
  href: string,
  communityId: number | null,
): void {
  if (!communityId) {
    return;
  }
  const pathname = href.split('?')[0] ?? href;

  // Documents hub: useDocuments({ communityId, categoryId: undefined })
  if (pathname.endsWith('/documents')) {
    void prefetchDocuments(queryClient, communityId);
  }
}
