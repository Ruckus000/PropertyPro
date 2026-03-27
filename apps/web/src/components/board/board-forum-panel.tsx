'use client';

import { EmptyState } from '@/components/shared/empty-state';
import { AlertBanner } from '@/components/shared/alert-banner';
import { StatusBadge } from '@/components/shared/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useBoardForumThreads } from '@/hooks/use-board';

interface BoardForumPanelProps {
  communityId: number;
}

export function BoardForumPanel({ communityId }: BoardForumPanelProps) {
  const { data, isLoading, error } = useBoardForumThreads(communityId, { limit: 50, offset: 0 });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <AlertBanner
        status="danger"
        title="We couldn't load forum threads."
        description={error instanceof Error ? error.message : 'Please try again.'}
      />
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState preset="no_board_threads" />;
  }

  return (
    <div className="space-y-4">
      {data.map((thread) => (
        <article key={thread.id} className="rounded-xl border border-edge bg-surface-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-content">{thread.title}</h2>
              <p className="line-clamp-3 text-sm text-content-secondary">{thread.body}</p>
            </div>
            {thread.isLocked ? <StatusBadge status="closed" label="Locked" /> : null}
          </div>
        </article>
      ))}
    </div>
  );
}
