'use client';

import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useBoardPollResults } from '@/hooks/use-board';

interface PollResultsSectionProps {
  communityId: number;
  pollId: number;
}

export function PollResultsSection({
  communityId,
  pollId,
}: PollResultsSectionProps) {
  const { data, isLoading, error } = useBoardPollResults(communityId, pollId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <AlertBanner
        status="danger"
        variant="subtle"
        title="We couldn't load poll results."
        description={error instanceof Error ? error.message : 'Please try again.'}
      />
    );
  }

  if (!data || data.options.length === 0) {
    return <EmptyState title="No results yet" description="Votes will appear here as responses are submitted." icon="inbox" size="sm" />;
  }

  return (
    <div className="space-y-3">
      {data.options.map((option) => (
        <div key={option.option} className="space-y-2 rounded-lg border border-edge p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-content">{option.option}</span>
            <span className="text-sm text-content-secondary">
              {option.votes} vote{option.votes === 1 ? '' : 's'} · {Math.round(option.percentage)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-muted">
            <div className="h-2 rounded-sm bg-interactive-primary" style={{ width: `${option.percentage}%` }} />
          </div>
        </div>
      ))}
      <p className="text-sm text-content-secondary">Total votes: {data.totalVotes}</p>
    </div>
  );
}
