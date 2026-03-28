'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useBoardPollMyVote, useCastPollVote } from '@/hooks/use-board';

interface PollVotingSectionProps {
  communityId: number;
  pollId: number;
  options: string[];
  pollType: 'single_choice' | 'multiple_choice';
  isActive: boolean;
}

export function PollVotingSection({
  communityId,
  pollId,
  options,
  pollType,
  isActive,
}: PollVotingSectionProps) {
  const { data, isLoading, error } = useBoardPollMyVote(communityId, pollId);
  const castVote = useCastPollVote(communityId, pollId);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <AlertBanner
        status="danger"
        variant="subtle"
        title="We couldn't load your vote."
        description={error instanceof Error ? error.message : 'Please try again.'}
      />
    );
  }

  const hasVoted = data?.hasVoted === true;
  const selected = hasVoted ? data.selectedOptions : selectedOptions;

  function toggleOption(option: string, checked: boolean) {
    if (pollType === 'single_choice') {
      setSelectedOptions(checked ? [option] : []);
      return;
    }

    setSelectedOptions((current) =>
      checked ? [...current, option] : current.filter((item) => item !== option),
    );
  }

  return (
    <div className="space-y-3">
      {castVote.error ? (
        <AlertBanner
          status="danger"
          variant="subtle"
          title="We couldn't record this vote."
          description={castVote.error instanceof Error ? castVote.error.message : 'Please try again.'}
        />
      ) : null}

      <div className="space-y-2">
        {options.map((option) => {
          const checked = selected.includes(option);

          return (
            <label
              key={option}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-edge p-3 md:min-h-9',
                checked && 'border-interactive bg-surface-hover',
                (hasVoted || !isActive) && 'cursor-default',
              )}
            >
              <Checkbox
                checked={checked}
                disabled={hasVoted || !isActive || castVote.isPending}
                onCheckedChange={(value) => toggleOption(option, value === true)}
              />
              <span className="flex-1 text-sm text-content">{option}</span>
              {hasVoted && checked ? <CheckCircle2 className="h-4 w-4 text-status-success" aria-hidden="true" /> : null}
            </label>
          );
        })}
      </div>

      {hasVoted ? (
        <p className="text-sm text-content-secondary">Your vote is recorded.</p>
      ) : null}

      {!hasVoted && !isActive ? (
        <p className="text-sm text-content-secondary">This poll has ended.</p>
      ) : null}

      {!hasVoted && isActive ? (
        <Button
          type="button"
          className="h-11 md:h-9"
          disabled={selectedOptions.length === 0 || castVote.isPending}
          onClick={() => void castVote.mutateAsync(selectedOptions)}
        >
          {castVote.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Submit Vote
        </Button>
      ) : null}
    </div>
  );
}
