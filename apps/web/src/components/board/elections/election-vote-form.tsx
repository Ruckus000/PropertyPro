'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useCastElectionVote, type ElectionCandidate } from '@/hooks/use-board';

interface ElectionVoteFormProps {
  communityId: number;
  electionId: number;
  candidates: ElectionCandidate[];
  maxSelections: number;
  isSecretBallot: boolean;
}

export function ElectionVoteForm({
  communityId,
  electionId,
  candidates,
  maxSelections,
  isSecretBallot,
}: ElectionVoteFormProps) {
  const castVote = useCastElectionVote(communityId, electionId);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<number[]>([]);
  const [isAbstaining, setIsAbstaining] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submittedReceipt, setSubmittedReceipt] = useState<{
    submissionFingerprint: string | null;
    submittedAt: string;
  } | null>(null);

  const sortedCandidates = useMemo(
    () => [...candidates].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [candidates],
  );

  function toggleCandidate(candidateId: number, checked: boolean) {
    setIsAbstaining(false);
    setSelectedCandidateIds((current) => {
      if (!checked) {
        return current.filter((id) => id !== candidateId);
      }
      if (current.includes(candidateId) || current.length >= maxSelections) {
        return current;
      }
      return [...current, candidateId];
    });
  }

  async function handleSubmit() {
    const data = isAbstaining
      ? await castVote.mutateAsync({ isAbstention: true })
      : await castVote.mutateAsync({ selectedCandidateIds });

    setSubmittedReceipt({
      submissionFingerprint: data.submissionFingerprint,
      submittedAt: new Date().toISOString(),
    });
    setReviewOpen(false);
  }

  const selectionSummary = isAbstaining
    ? ['Abstain']
    : sortedCandidates
        .filter((candidate) => selectedCandidateIds.includes(candidate.id))
        .map((candidate) => candidate.label);
  const canReview = isAbstaining || selectedCandidateIds.length > 0;

  if (submittedReceipt) {
    return (
      <div className="space-y-3 rounded-xl border border-status-success-border bg-status-success-subtle p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-status-success" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-status-success">Ballot recorded</p>
            <p className="text-sm text-content-secondary">
              {isSecretBallot ? 'Your secret ballot receipt is ready.' : 'Your ballot submission has been recorded.'}
            </p>
            <p className="text-xs text-content-secondary">
              Receipt: <span className="font-medium text-content">{submittedReceipt.submissionFingerprint ?? 'Processing'}</span>
            </p>
            <p className="text-xs text-content-secondary">
              Submitted {new Date(submittedReceipt.submittedAt).toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-edge bg-surface-card p-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-content">Cast your ballot</h3>
        <p className="text-sm text-content-secondary">
          Select up to {maxSelections} candidate{maxSelections === 1 ? '' : 's'} or abstain.
        </p>
      </div>

      {castVote.error ? (
        <AlertBanner
          status="danger"
          variant="subtle"
          title="We couldn't cast this ballot."
          description={castVote.error instanceof Error ? castVote.error.message : 'Please try again.'}
        />
      ) : null}

      <div className="space-y-3">
        {sortedCandidates.map((candidate) => {
          const checked = selectedCandidateIds.includes(candidate.id);
          const disabled = castVote.isPending || (selectedCandidateIds.length >= maxSelections && !checked) || isAbstaining;

          return (
            <label
              key={candidate.id}
              className={cn(
                'flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-edge p-3 transition-colors md:min-h-9',
                checked && 'border-interactive bg-surface-hover',
                disabled && !checked && 'opacity-60',
              )}
            >
              <Checkbox
                checked={checked}
                disabled={disabled}
                onCheckedChange={(value) => toggleCandidate(candidate.id, value === true)}
                className="mt-1"
              />
              <div className="space-y-1">
                <p className="text-sm font-medium text-content">{candidate.label}</p>
                {candidate.description ? (
                  <p className="text-sm text-content-secondary">{candidate.description}</p>
                ) : null}
              </div>
            </label>
          );
        })}
      </div>

      <div className="rounded-lg border border-edge bg-surface-muted p-3">
        <div className="flex min-h-11 items-center gap-3 md:min-h-9">
          <Checkbox
            checked={isAbstaining}
            disabled={castVote.isPending}
            onCheckedChange={(value) => {
              const nextChecked = value === true;
              setIsAbstaining(nextChecked);
              if (nextChecked) {
                setSelectedCandidateIds([]);
              }
            }}
          />
          <div>
            <Label className="text-sm font-medium text-content">Abstain</Label>
            <p className="text-xs text-content-secondary">Submitting an abstention clears any candidate selections.</p>
          </div>
        </div>
      </div>

      {maxSelections > 1 ? (
        <p className="text-xs text-content-secondary">
          {selectedCandidateIds.length} of {maxSelections} selected
        </p>
      ) : null}

      <Button
        type="button"
        className="h-11 w-full md:h-9"
        disabled={!canReview || castVote.isPending}
        onClick={() => setReviewOpen(true)}
      >
        {castVote.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Review Ballot
      </Button>

      <AlertDialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Review ballot</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm your selection before casting. {isSecretBallot ? 'This election uses a secret ballot.' : 'Your choices will be recorded as submitted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 text-sm text-content">
            {selectionSummary.map((item) => (
              <div key={item} className="rounded-md border border-edge bg-surface-muted px-3 py-2">
                {item}
              </div>
            ))}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={castVote.isPending}>Go back</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 md:h-9"
              disabled={castVote.isPending}
              onClick={(event) => {
                event.preventDefault();
                void handleSubmit();
              }}
            >
              {castVote.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Cast Ballot
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
