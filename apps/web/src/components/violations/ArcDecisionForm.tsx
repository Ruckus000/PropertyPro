'use client';

/**
 * Reviewer actions on an ARC submission: start review, approve, deny.
 *
 * A separate component rather than more code inside `ArcSubmissionsTab`, which
 * is already 257 lines doing list, filters and detail. Adding two forms would
 * give it a fourth job. The sibling precedent is `ViolationStatusTransition`,
 * which is likewise its own file beside the violations table.
 *
 * **The denial reason is required in the UI, not discovered as a 400.** HB 1203
 * requires an ARC denial to state the specific reason and identify the rule or
 * covenant relied on. Both the route contract and the service enforce that, so
 * a denial without notes fails either way — but failing at the server means a
 * reviewer writes a decision, clicks Deny, and gets a validation error for a
 * field the form never asked about. The requirement is surfaced here instead,
 * with the statute named, so the reviewer knows why before they type.
 */
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  useDecideArcSubmission,
  useReviewArcSubmission,
  type ArcSubmission,
} from '@/hooks/use-arc';
import { allowedArcActions } from '@/lib/violations/arc-actions';

interface ArcDecisionFormProps {
  submission: ArcSubmission;
  communityId: number;
  /** Called after a successful mutation so the parent can close its panel. */
  onComplete: () => void;
}

export function ArcDecisionForm({
  submission,
  communityId,
  onComplete,
}: ArcDecisionFormProps) {
  const [reviewNotes, setReviewNotes] = useState(submission.reviewNotes ?? '');
  const [error, setError] = useState('');

  const reviewMutation = useReviewArcSubmission(communityId);
  const decideMutation = useDecideArcSubmission(communityId);
  const isSubmitting = reviewMutation.isPending || decideMutation.isPending;

  const actions = allowedArcActions(submission.status);
  const canReview = actions.includes('review');
  const canDecide = actions.includes('decide');

  const run = useCallback(
    async (label: string, work: () => Promise<unknown>) => {
      setError('');
      try {
        await work();
        toast.success(label);
        onComplete();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed. Please try again.');
      }
    },
    [onComplete],
  );

  const handleDeny = useCallback(() => {
    // Checked before the request, so the reviewer is told what is missing
    // rather than shown a 400 about a field they were never prompted for.
    if (!reviewNotes.trim()) {
      setError(
        'A denial must include written reasons citing the specific rule or covenant relied on (HB 1203).',
      );
      return;
    }
    return run('Application denied. The resident has been notified.', () =>
      decideMutation.mutateAsync({
        id: submission.id,
        decision: 'denied',
        reviewNotes: reviewNotes.trim(),
      }),
    );
  }, [decideMutation, reviewNotes, run, submission.id]);

  if (!canReview && !canDecide) {
    return null;
  }

  const denialReasonMissing = !reviewNotes.trim();

  return (
    <div className="space-y-4 rounded-md border border-edge bg-surface-hover p-4">
      <h4 className="text-sm font-semibold text-content">Record a decision</h4>

      {error && (
        <div role="alert" className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="arc-review-notes" className="mb-1 block text-sm font-medium text-content-secondary">
          Review notes
        </label>
        <textarea
          id="arc-review-notes"
          rows={5}
          value={reviewNotes}
          onChange={(e) => setReviewNotes(e.target.value)}
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
          placeholder="Cite the rule or covenant this decision relies on."
        />
        <p className="mt-1 text-xs text-content-disabled">
          Optional to approve. <strong>Required to deny</strong> — Florida HB 1203
          requires a denial to state the specific reason and identify the rule or
          covenant relied on. This text is sent to the resident.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {canDecide && (
          <>
            <Button
              type="button"
              onClick={() =>
                run('Application approved. The resident has been notified.', () =>
                  decideMutation.mutateAsync({
                    id: submission.id,
                    decision: 'approved',
                    reviewNotes: reviewNotes.trim() || null,
                  }),
                )
              }
              disabled={isSubmitting}
            >
              Approve
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeny}
              disabled={isSubmitting}
              // Not `disabled` on a missing reason: a disabled button with no
              // explanation is a dead end. It stays clickable and explains.
              aria-describedby={denialReasonMissing ? 'arc-review-notes' : undefined}
            >
              Deny
            </Button>
          </>
        )}
        {canReview && submission.status === 'submitted' && (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              run('Marked under review.', () =>
                reviewMutation.mutateAsync({
                  id: submission.id,
                  reviewNotes: reviewNotes.trim() || null,
                }),
              )
            }
            disabled={isSubmitting}
          >
            Mark under review
          </Button>
        )}
      </div>
    </div>
  );
}
