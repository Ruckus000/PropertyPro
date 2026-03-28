'use client';

import { useState } from 'react';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { ElectionDetailDialog } from '@/components/board/elections/election-detail-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useBoardElectionReceipt,
  useBoardElections,
  useSnapshotEligibility,
} from '@/hooks/use-board';

function ElectionReceiptSummary({
  communityId,
  electionId,
}: {
  communityId: number;
  electionId: number;
}) {
  const { data, isLoading, error } = useBoardElectionReceipt(communityId, electionId);

  if (isLoading) {
    return <p className="text-xs text-content-tertiary">Checking your receipt…</p>;
  }

  if (error || !data) {
    return (
      <p className="text-xs text-content-tertiary">
        Your voting receipt is temporarily unavailable.
      </p>
    );
  }

  if (!data.hasVoted) {
    return (
      <p className="text-xs text-content-tertiary">
        No ballot receipt is on file for your unit yet.
      </p>
    );
  }

  return (
    <div className="space-y-1 text-xs text-content-tertiary">
      <p>
        Ballot received {data.submittedAt ? new Date(data.submittedAt).toLocaleString() : 'recently'}.
      </p>
      <p>
        Receipt: <span className="font-medium text-content">{data.submissionFingerprint}</span>
      </p>
    </div>
  );
}

interface BoardElectionsPanelProps {
  communityId: number;
  isAdmin: boolean;
  userId: string;
}

export function BoardElectionsPanel({
  communityId,
  isAdmin,
  userId,
}: BoardElectionsPanelProps) {
  const { data, isLoading, error } = useBoardElections(communityId, { limit: 25 });
  const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);

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
        title="We couldn't load elections."
        description={error instanceof Error ? error.message : 'Please try again.'}
      />
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState preset="no_board_elections" />;
  }

  return (
    <>
      <div className="space-y-4">
        {data.map((election) => (
          <ElectionCard
            key={election.id}
            communityId={communityId}
            election={election}
            isAdmin={isAdmin}
            onOpen={() => setSelectedElectionId(election.id)}
          />
        ))}
      </div>

      <ElectionDetailDialog
        communityId={communityId}
        electionId={selectedElectionId}
        isAdmin={isAdmin}
        userId={userId}
        open={selectedElectionId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedElectionId(null);
          }
        }}
      />
    </>
  );
}

function ElectionCard({
  communityId,
  election,
  isAdmin,
  onOpen,
}: {
  communityId: number;
  election: {
    id: number;
    title: string;
    description: string | null;
    opensAt: string;
    closesAt: string;
    status: string;
  };
  isAdmin: boolean;
  onOpen: () => void;
}) {
  const snapshotEligibility = useSnapshotEligibility(communityId, election.id);

  return (
    <article
      className={cn('cursor-pointer rounded-xl border border-edge bg-surface-card p-5 transition-colors hover:border-interactive-primary')}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-content">{election.title}</h2>
          {election.description ? (
            <p className="text-sm text-content-secondary">{election.description}</p>
          ) : null}
          <p className="text-xs text-content-tertiary">
            Opens {new Date(election.opensAt).toLocaleString()} and closes {new Date(election.closesAt).toLocaleString()}
          </p>
          <ElectionReceiptSummary communityId={communityId} electionId={election.id} />
        </div>
        <StatusBadge status={election.status} />
      </div>

      {isAdmin && election.status === 'draft' ? (
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-11 md:h-9"
            disabled={snapshotEligibility.isPending}
            onClick={(event) => {
              event.stopPropagation();
              void snapshotEligibility.mutateAsync();
            }}
          >
            Snapshot Eligibility
          </Button>
        </div>
      ) : null}
    </article>
  );
}
