'use client';

import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useBoardElectionResults } from '@/hooks/use-board';

interface ElectionResultsSectionProps {
  communityId: number;
  electionId: number;
}

export function ElectionResultsSection({
  communityId,
  electionId,
}: ElectionResultsSectionProps) {
  const { data, isLoading, error } = useBoardElectionResults(communityId, electionId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <AlertBanner
        status="danger"
        variant="subtle"
        title="We couldn't load election results."
        description={error instanceof Error ? error.message : 'Please try again.'}
      />
    );
  }

  if (!data || data.candidateResults.length === 0) {
    return <EmptyState title="No results yet" description="Ballot totals will appear here once votes have been recorded." icon="inbox" size="sm" />;
  }

  const quorumNeeded = Math.ceil((data.eligibleUnitCount * data.quorumPercentage) / 100);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {data.candidateResults.map((result) => {
          const percentage = data.totalBallotsCast === 0 ? 0 : Math.round((result.voteCount / data.totalBallotsCast) * 100);

          return (
            <div key={result.candidateId} className="space-y-2 rounded-lg border border-edge p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-content">{result.label}</span>
                <span className="text-sm text-content-secondary">
                  {result.voteCount} vote{result.voteCount === 1 ? '' : 's'} · {percentage}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-muted">
                <div
                  className="h-2 rounded-sm bg-interactive-primary transition-[width]"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2 rounded-lg border border-edge p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-content">Quorum</span>
          <span className="text-sm text-content-secondary">
            {data.totalBallotsCast} of {quorumNeeded} needed ({data.quorumPercentage}%)
          </span>
        </div>
        <div className="h-2 rounded-full bg-surface-muted">
          <div
            className={cn(
              'h-2 rounded-sm transition-[width]',
              data.quorumMet ? 'bg-status-success' : 'bg-status-warning',
            )}
            style={{ width: `${Math.min(100, Math.round((data.totalBallotsCast / Math.max(quorumNeeded, 1)) * 100))}%` }}
          />
        </div>
        <p className="text-xs text-content-secondary">
          {data.quorumMet ? 'Quorum requirement has been met.' : 'Quorum has not been met yet.'}
        </p>
      </div>

      <p className="text-sm text-content-secondary">{data.abstentionCount} abstention{data.abstentionCount === 1 ? '' : 's'}</p>
    </div>
  );
}
