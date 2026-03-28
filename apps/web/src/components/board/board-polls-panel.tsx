'use client';

import { useState } from 'react';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { CreatePollDialog } from '@/components/board/polls/create-poll-dialog';
import { PollResultsSection } from '@/components/board/polls/poll-results-section';
import { PollVotingSection } from '@/components/board/polls/poll-voting-section';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBoardPollMyVote, useBoardPolls } from '@/hooks/use-board';

interface BoardPollsPanelProps {
  communityId: number;
  isAdmin: boolean;
}

export function BoardPollsPanel({ communityId, isAdmin }: BoardPollsPanelProps) {
  const { data, isLoading, error } = useBoardPolls(communityId);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

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

  return (
    <>
      <div className="space-y-4">
        {isAdmin ? (
          <div className="flex justify-end">
            <Button type="button" className="h-11 md:h-9" onClick={() => setCreateDialogOpen(true)}>
              Create Poll
            </Button>
          </div>
        ) : null}

        {!data || data.length === 0 ? (
          <EmptyState preset="no_board_polls" />
        ) : (
          data.map((poll) => (
            <article key={poll.id} className="space-y-4 rounded-xl border border-edge bg-surface-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-content">{poll.title}</h2>
                  {poll.description ? (
                    <p className="text-sm text-content-secondary">{poll.description}</p>
                  ) : null}
                  {poll.endsAt ? (
                    <p className="text-xs text-content-tertiary">Ends {new Date(poll.endsAt).toLocaleString()}</p>
                  ) : null}
                </div>
                <StatusBadge status={poll.isActive ? 'open' : 'closed'} />
              </div>

              <PollVotingSection
                communityId={communityId}
                pollId={poll.id}
                options={poll.options}
                pollType={poll.pollType}
                isActive={poll.isActive}
              />

              <PollResultsGate communityId={communityId} pollId={poll.id} isActive={poll.isActive} />
            </article>
          ))
        )}
      </div>

      {isAdmin ? (
        <CreatePollDialog
          communityId={communityId}
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
        />
      ) : null}
    </>
  );
}

function PollResultsGate({
  communityId,
  pollId,
  isActive,
}: {
  communityId: number;
  pollId: number;
  isActive: boolean;
}) {
  const { data, isLoading } = useBoardPollMyVote(communityId, pollId);

  if (isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }

  if (!isActive || data?.hasVoted) {
    return <PollResultsSection communityId={communityId} pollId={pollId} />;
  }

  return (
    <p className="text-sm text-content-secondary">
      Results will appear after you vote or when this poll ends.
    </p>
  );
}
