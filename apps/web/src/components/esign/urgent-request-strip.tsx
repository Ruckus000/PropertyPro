'use client';

/**
 * One row of cross-view context: the request most about to run out.
 *
 * Exactly one, and only inside the urgent window, because the point of the
 * meetings-style restructure was to stop stacking cards that compete for the
 * same glance. The shell suppresses this entirely when the request is already
 * in the "Awaiting your signature" panel — which is the likely case for a
 * manager chasing their own request, and would otherwise print the same title
 * twice, one above the other.
 */

import Link from 'next/link';
import { AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  describeExpiry,
  outstandingSigners,
  requestTitle,
  signatureProgress,
  type EsignRequest,
} from '@/lib/esign/submission-status';

export interface UrgentRequestStripProps {
  communityId: number;
  request: EsignRequest;
  now: Date;
}

export function UrgentRequestStrip({ communityId, request, now }: UrgentRequestStripProps) {
  const expiry = describeExpiry(request.expiresAt, now);
  if (!expiry) return null;

  const progress = signatureProgress(request);
  const outstanding = outstandingSigners([request], now).length;
  const Icon = expiry.tone === 'danger' ? AlertTriangle : Clock;

  return (
    <section aria-label="Most urgent request">
      <Card
        className={cn(
          'flex flex-wrap items-center gap-3 border-l-4 p-4',
          expiry.tone === 'danger' ? 'border-l-status-danger' : 'border-l-status-warning',
        )}
      >
        <Icon
          aria-hidden="true"
          className={cn(
            'size-5 shrink-0',
            expiry.tone === 'danger' ? 'text-status-danger' : 'text-status-warning',
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-content">
            {requestTitle(request)} · {expiry.label}
          </p>
          <p className="truncate text-sm text-content-secondary">
            {outstanding} signature{outstanding === 1 ? '' : 's'} outstanding of{' '}
            {progress.total} · after it expires the request has to be sent again
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="min-h-11 shrink-0 sm:min-h-0">
          <Link href={`/esign/submissions/${request.id}?communityId=${communityId}`}>Open</Link>
        </Button>
      </Card>
    </section>
  );
}
