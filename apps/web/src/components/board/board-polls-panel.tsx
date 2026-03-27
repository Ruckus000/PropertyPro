'use client';

import { EmptyState } from '@/components/shared/empty-state';
import { AlertBanner } from '@/components/shared/alert-banner';
import { StatusBadge } from '@/components/shared/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useBoardPolls } from '@/hooks/use-board';

interface BoardPollsPanelProps {
  communityId: number;
}

export function BoardPollsPanel({ communityId }: BoardPollsPanelProps) {
  const { data, isLoading, error } = useBoardPolls(communityId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <AlertBanner
        status="danger"
        title="We couldn't load board polls."
        description={error instanceof Error ? error.message : 'Please try again.'}
      />
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState preset="no_board_polls" />;
  }

  return (
    <div className="space-y-4">
      {data.map((poll) => (
        <article key={poll.id} className="rounded-xl border border-edge bg-surface-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-content">{poll.title}</h2>
              {poll.description ? (
                <p className="text-sm text-content-secondary">{poll.description}</p>
              ) : null}
            </div>
            <StatusBadge status={poll.isActive ? 'open' : 'closed'} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {poll.options.map((option) => (
              <span
                key={option}
                className="rounded-full bg-surface-muted px-3 py-1 text-xs text-content-secondary"
              >
                {option}
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
