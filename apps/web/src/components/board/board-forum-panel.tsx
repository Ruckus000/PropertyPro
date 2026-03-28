'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { CreateThreadDialog } from '@/components/board/forum/create-thread-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useBoardForumThreads } from '@/hooks/use-board';

interface BoardForumPanelProps {
  communityId: number;
  isAdmin: boolean;
}

export function BoardForumPanel({ communityId, isAdmin }: BoardForumPanelProps) {
  const { data, isLoading, error } = useBoardForumThreads(communityId, { limit: 50, offset: 0 });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

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

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button type="button" className="h-11 md:h-9" onClick={() => setCreateDialogOpen(true)}>
            New Thread
          </Button>
        </div>

        {!data || data.length === 0 ? (
          <EmptyState preset="no_board_threads" />
        ) : (
          data.map((thread) => (
            <Link
              key={thread.id}
              href={`/communities/${communityId}/board/forum/${thread.id}`}
              className={cn('block rounded-xl border border-edge bg-surface-card p-5 transition-colors hover:border-interactive-primary')}
            >
              <article className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-content">{thread.title}</h2>
                    {thread.isPinned ? <StatusBadge status="submitted" label="Pinned" /> : null}
                  </div>
                  <p className="line-clamp-3 text-sm text-content-secondary">{thread.body}</p>
                </div>
                {thread.isLocked ? <StatusBadge status="closed" label="Locked" /> : null}
              </article>
            </Link>
          ))
        )}
      </div>

      <CreateThreadDialog
        communityId={communityId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </>
  );
}
