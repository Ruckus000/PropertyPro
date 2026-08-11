'use client';

/**
 * A resident's own ARC applications, with the withdraw action.
 *
 * Separate from `ArcSubmissionsTab` rather than a role-conditional inside it:
 * the two views answer different questions. A reviewer needs a queue with
 * status filters and counts across the whole community; a resident needs "where
 * did mine get to", usually for one or two rows. Merging them would mean a
 * component branching on role in its filters, its columns and its actions.
 *
 * The list is scoped by the server — `/api/v1/arc` filters to the caller's own
 * units for a resident role — so this renders whatever it is given without
 * doing any filtering of its own.
 */
import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { cn } from '@/lib/utils';
import {
  useArcSubmissions,
  useWithdrawArcSubmission,
  type ArcSubmission,
} from '@/hooks/use-arc';
import { allowedArcActions } from '@/lib/violations/arc-actions';
import { STATUS_BADGE_CLASSES, STATUS_LABELS } from './arc-status';

interface ResidentArcRequestsProps {
  communityId: number;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ResidentArcRequests({ communityId }: ResidentArcRequestsProps) {
  const { data: submissions, isLoading } = useArcSubmissions(communityId);
  const withdrawMutation = useWithdrawArcSubmission(communityId);
  const [pendingId, setPendingId] = useState<number | null>(null);

  async function handleWithdraw(submission: ArcSubmission) {
    if (!window.confirm(`Withdraw "${submission.title}"? This cannot be undone.`)) {
      return;
    }
    setPendingId(submission.id);
    try {
      await withdrawMutation.mutateAsync({ id: submission.id });
      toast.success('Request withdrawn.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to withdraw this request.');
    } finally {
      setPendingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-md border border-edge bg-surface-hover" />
        ))}
      </div>
    );
  }

  if (!submissions || submissions.length === 0) {
    return (
      <EmptyState
        title="No architectural requests yet"
        description="Planning an exterior change — paint, a fence, new windows? Submit it here before work begins and keep the approval on record."
        action={
          <Button asChild>
            <Link href={`/arc-requests/new?communityId=${communityId}`}>
              Start a request
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <ul className="space-y-3">
      {submissions.map((submission) => {
        const canWithdraw = allowedArcActions(submission.status).includes('withdraw');
        return (
          <li
            key={submission.id}
            className="rounded-md border border-edge bg-surface-card p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-content">{submission.title}</h3>
                <p className="mt-1 text-xs text-content-secondary">
                  {submission.projectType} · Unit #{submission.unitId} · Submitted{' '}
                  {formatDate(submission.createdAt)}
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn('capitalize', STATUS_BADGE_CLASSES[submission.status])}
              >
                {STATUS_LABELS[submission.status] ?? submission.status}
              </Badge>
            </div>

            <p className="mt-3 whitespace-pre-wrap text-sm text-content-secondary">
              {submission.description}
            </p>

            {/*
              Shown to the resident whenever it exists, not only on a denial.
              HB 1203 makes the written reason the substance of a denial, and a
              resident who cannot read it has to ring the office to find out why.
            */}
            {submission.reviewNotes && (
              <div className="mt-3 rounded-md bg-surface-hover px-3 py-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-content-secondary">
                  Committee notes
                </h4>
                <p className="mt-1 whitespace-pre-wrap text-sm text-content">
                  {submission.reviewNotes}
                </p>
              </div>
            )}

            {canWithdraw && (
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleWithdraw(submission)}
                  loading={pendingId === submission.id}
                >
                  Withdraw
                </Button>
              </div>
            )}
          </li>
        );
      })}
      <li className="pt-2">
        <Link
          href={`/arc-requests/new?communityId=${communityId}`}
          className="text-sm font-medium text-interactive hover:underline"
        >
          Submit another request
        </Link>
      </li>
    </ul>
  );
}
