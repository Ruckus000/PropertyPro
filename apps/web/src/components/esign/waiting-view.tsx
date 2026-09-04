'use client';

/**
 * Waiting on — who is holding something up, and what can I do about it now.
 *
 * The same set as Requests, read from the other end. It reads the SAME
 * unfiltered query the table does, so React Query serves both from one cache
 * entry; asking the server for `?status=pending` would be a different key, a
 * second request, and a second entry for the reminder to invalidate.
 */

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import {
  describeExpiry,
  outstandingSigners,
  requestTitle,
  signatureProgress,
  type EsignRequest,
} from '@/lib/esign/submission-status';
import { SignerRow } from './signer-row';

export interface WaitingViewProps {
  communityId: number;
  requests: EsignRequest[];
  now: Date;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function WaitingView({
  communityId,
  requests,
  now,
  isLoading,
  isError,
  onRetry,
}: WaitingViewProps) {
  if (isError) {
    return (
      <AlertBanner
        status="danger"
        variant="subtle"
        title="Couldn't load what's outstanding"
        description="Something went wrong while loading your signature requests."
        action={
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    );
  }

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  const outstanding = outstandingSigners(requests, now);

  if (outstanding.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState preset="no_esign_waiting" />
      </Card>
    );
  }

  // Already ordered by expiry then signing position, so grouping in encounter
  // order preserves "most pressing first" without a second sort.
  const groups: Array<{ request: EsignRequest; signers: EsignRequest['signers'] }> = [];
  for (const { request, signer } of outstanding) {
    const last = groups[groups.length - 1];
    if (last && last.request.id === request.id) {
      last.signers.push(signer);
    } else {
      groups.push({ request, signers: [signer] });
    }
  }

  return (
    <div className="space-y-6">
      {groups.map(({ request, signers }) => {
        const expiry = describeExpiry(request.expiresAt, now);
        const progress = signatureProgress(request);

        return (
          <section key={request.id} className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <Link
                href={`/esign/submissions/${request.id}?communityId=${communityId}`}
                className="font-medium text-content hover:text-content-link hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
              >
                {requestTitle(request)}
              </Link>
              <span className="text-sm text-content-secondary">
                {expiry ? `${expiry.label} · ` : ''}
                {progress.signed} of {progress.total} signed ·{' '}
                {request.signingOrder === 'sequential' ? 'In order' : 'All at once'}
              </span>
            </div>

            <Card className="px-4">
              <ul className="divide-y divide-edge-subtle">
                {signers.map((signer) => (
                  <SignerRow
                    key={signer.id}
                    communityId={communityId}
                    request={request}
                    signer={signer}
                  />
                ))}
              </ul>
            </Card>
          </section>
        );
      })}
    </div>
  );
}
