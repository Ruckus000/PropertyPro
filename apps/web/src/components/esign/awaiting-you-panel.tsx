'use client';

/**
 * The one thing on this screen the viewer can clear without asking anyone.
 *
 * Every other reading of E-Sign is about other people. Derived from the same
 * requests list rather than from `/api/v1/esign/my-pending`, because that
 * endpoint carries neither the signer's role nor the request's signature
 * counts — and a second source of the same fact is a guarantee that the panel
 * and the table will eventually disagree.
 *
 * Blocked signers are excluded rather than shown greyed: this is a to-do list,
 * and an item whose link the signing page would refuse is noise. The request
 * still appears in the table with its blocked state shown correctly.
 */

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  canShareLink,
  describeExpiry,
  isOpenSigner,
  requestTitle,
  signatureProgress,
  type EsignRequest,
  type EsignRequestSigner,
} from '@/lib/esign/submission-status';

export interface AwaitingYouPanelProps {
  communityId: number;
  requests: EsignRequest[];
  now: Date;
  viewerUserId: string;
  viewerEmail: string | null;
}

/** Requests where the viewer is themselves a signer who can act right now. */
export function awaitingViewer(
  requests: EsignRequest[],
  viewerUserId: string,
  viewerEmail: string | null,
): Array<{ request: EsignRequest; signer: EsignRequestSigner }> {
  const email = viewerEmail?.trim().toLowerCase() ?? null;
  const out: Array<{ request: EsignRequest; signer: EsignRequestSigner }> = [];

  for (const request of requests) {
    for (const signer of request.signers) {
      const isViewer =
        signer.userId === viewerUserId ||
        (email !== null && signer.email.trim().toLowerCase() === email);
      if (!isViewer) continue;
      if (!isOpenSigner(request, signer)) continue;
      if (!canShareLink(request, signer)) continue;
      out.push({ request, signer });
    }
  }

  return out;
}

export function AwaitingYouPanel({
  communityId,
  requests,
  now,
  viewerUserId,
  viewerEmail,
}: AwaitingYouPanelProps) {
  const rows = awaitingViewer(requests, viewerUserId, viewerEmail);
  if (rows.length === 0) return null;

  return (
    <section aria-label="Awaiting your signature">
      <Card className="divide-y divide-edge-subtle border-interactive-subtle">
        {rows.map(({ request, signer }) => {
          const expiry = describeExpiry(request.expiresAt, now);
          const progress = signatureProgress(request);

          return (
            <div
              key={`${request.id}-${signer.id}`}
              className="flex flex-wrap items-center gap-3 p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-content">
                  Awaiting your signature · {requestTitle(request)}
                </p>
                <p className="truncate text-sm text-content-secondary">
                  You are the <span className="capitalize">{signer.role.replace(/_/g, ' ')}</span>
                  {expiry ? ` · ${expiry.label}` : ''} · {progress.signed} of {progress.total} signed
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-0">
                  <Link href={`/esign/submissions/${request.id}?communityId=${communityId}`}>
                    Open request
                  </Link>
                </Button>
                <Button asChild size="sm" className="min-h-11 sm:min-h-0">
                  <Link href={`/sign/${request.externalId}/${signer.slug}`}>
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                    Sign now
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}
      </Card>
    </section>
  );
}
