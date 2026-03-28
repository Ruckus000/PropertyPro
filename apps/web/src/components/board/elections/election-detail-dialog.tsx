'use client';

import { AlertBanner } from '@/components/shared/alert-banner';
import { StatusBadge } from '@/components/shared/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useBoardElectionDetail, useBoardElectionReceipt } from '@/hooks/use-board';
import { ElectionAdminActions } from './election-admin-actions';
import { ElectionProxySection } from './election-proxy-section';
import { ElectionResultsSection } from './election-results-section';
import { ElectionVoteForm } from './election-vote-form';

interface ElectionDetailDialogProps {
  communityId: number;
  electionId: number | null;
  isAdmin: boolean;
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ElectionDetailDialog({
  communityId,
  electionId,
  isAdmin,
  userId,
  open,
  onOpenChange,
}: ElectionDetailDialogProps) {
  const { data, isLoading, error } = useBoardElectionDetail(communityId, electionId);
  const receiptQuery = useBoardElectionReceipt(communityId, electionId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        {isLoading || electionId === null ? (
          <div className="space-y-4 py-2">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : null}

        {!isLoading && error ? (
          <AlertBanner
            status="danger"
            title="We couldn't load this election."
            description={error instanceof Error ? error.message : 'Please try again.'}
          />
        ) : null}

        {!isLoading && !error && data ? (
          <div className="space-y-6">
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <DialogTitle>{data.election.title}</DialogTitle>
                  {data.election.description ? (
                    <DialogDescription>{data.election.description}</DialogDescription>
                  ) : null}
                </div>
                <StatusBadge status={data.election.status} />
              </div>
            </DialogHeader>

            <div className="grid gap-3 rounded-xl border border-edge bg-surface-card p-4 text-sm text-content-secondary md:grid-cols-2">
              <p><span className="font-medium text-content">Type:</span> {data.election.electionType}</p>
              <p><span className="font-medium text-content">Quorum:</span> {data.election.quorumPercentage}%</p>
              <p><span className="font-medium text-content">Opens:</span> {new Date(data.election.opensAt).toLocaleString()}</p>
              <p><span className="font-medium text-content">Closes:</span> {new Date(data.election.closesAt).toLocaleString()}</p>
              <p><span className="font-medium text-content">Ballots cast:</span> {data.election.totalBallotsCast}</p>
              <p><span className="font-medium text-content">Eligible units:</span> {data.election.eligibleUnitCount}</p>
            </div>

            <div className="space-y-3 rounded-xl border border-edge bg-surface-card p-4">
              <h3 className="text-base font-semibold text-content">Candidates</h3>
              <div className="space-y-3">
                {data.candidates.map((candidate) => (
                  <div key={candidate.id} className="rounded-lg border border-edge p-3">
                    <p className="text-sm font-medium text-content">{candidate.label}</p>
                    {candidate.description ? (
                      <p className="mt-1 text-sm text-content-secondary">{candidate.description}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {data.election.status === 'open' && !receiptQuery.isLoading && !receiptQuery.data?.hasVoted ? (
              <>
                <Separator />
                <ElectionVoteForm
                  communityId={communityId}
                  electionId={data.election.id}
                  candidates={data.candidates}
                  maxSelections={data.election.maxSelections}
                  isSecretBallot={data.election.isSecretBallot}
                />
              </>
            ) : null}

            {receiptQuery.data?.hasVoted ? (
              <div className="rounded-xl border border-edge bg-surface-card p-4 text-sm">
                <p className="font-semibold text-content">Your receipt</p>
                <p className="mt-1 text-content-secondary">
                  {receiptQuery.data.submissionFingerprint ?? 'Receipt pending'} · {receiptQuery.data.submittedAt ? new Date(receiptQuery.data.submittedAt).toLocaleString() : 'Recently submitted'}
                </p>
              </div>
            ) : null}

            {(data.election.status === 'closed' || data.election.status === 'certified') ? (
              <>
                <Separator />
                <ElectionResultsSection communityId={communityId} electionId={data.election.id} />
              </>
            ) : null}

            <Separator />
            <ElectionProxySection
              communityId={communityId}
              electionId={data.election.id}
              isAdmin={isAdmin}
              userId={userId}
            />

            {isAdmin ? (
              <>
                <Separator />
                <ElectionAdminActions
                  communityId={communityId}
                  electionId={data.election.id}
                  status={data.election.status}
                  isAdmin={isAdmin}
                />
              </>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
