'use client';

/**
 * One signer, with the two verbs that actually matter.
 *
 * The same object in two places — inside an expanded request row, and in the
 * Waiting-on list — so it takes the same props and renders the same markup in
 * both. It always returns an `<li>`; both callers supply the `<ul>`. A
 * `variant` prop would be a fork sharing a file name.
 *
 * It calls `useSendEsignReminder` ITSELF rather than taking a mutation from a
 * parent. TanStack keeps `isPending` on the observer, so a hook per row means a
 * pending state per row. `submission-detail.tsx` hoists one mutation to the
 * parent and disables every signer's Remind button the moment you remind one of
 * them; this is that bug's absence, not its accident.
 */

import { Check, Clock, Copy, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@propertypro/ui';
import { ESIGN_MAX_REMINDERS } from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import { useSendEsignReminder } from '@/hooks/use-esign-submissions';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { formatShortDate } from '@/lib/utils/format-date';
import {
  canRemind,
  canShareLink,
  findBlockingPriorSigner,
  type EsignRequest,
  type EsignRequestSigner,
} from '@/lib/esign/submission-status';
import { ESIGN_FIELD_COLORS } from './esign-field-colors';
import { esignStatusDisplay } from './esign-status-config';

export interface SignerRowProps {
  communityId: number;
  request: EsignRequest;
  signer: EsignRequestSigner;
}

/** What has happened to this signer lately, in one line. */
function describeActivity(signer: EsignRequestSigner): string {
  if (signer.completedAt) return `Signed ${formatShortDate(signer.completedAt)}`;
  if (signer.reminderCount === 0) return 'No reminders sent';
  return `${signer.reminderCount} of ${ESIGN_MAX_REMINDERS} reminders sent`;
}

export function SignerRow({ communityId, request, signer }: SignerRowProps) {
  const remind = useSendEsignReminder(communityId);
  const { copy, copied } = useCopyToClipboard();

  const blocker = findBlockingPriorSigner(request, signer);
  const shareable = canShareLink(request, signer);
  const remindable = canRemind(request, signer);
  const status = esignStatusDisplay(signer.status);
  const StatusIcon = status.icon;

  // Colour is derived here, not passed in, so the two callers cannot disagree.
  // It keys on position, whereas the PDF overlay keys on signer ROLE — two
  // signers sharing a role get two dots here and one colour on the document.
  const colorIndex = request.signers.findIndex((s) => s.id === signer.id);
  const color = ESIGN_FIELD_COLORS[
    (colorIndex < 0 ? 0 : colorIndex) % ESIGN_FIELD_COLORS.length
  ] as string;

  return (
    <li className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
      {/*
        Identity, not status: it says which signer, and their name is right
        beside it, so it duplicates nothing. `StatusDot` is the wrong component
        here — it requires a label because it does carry meaning.
      */}
      <span
        aria-hidden="true"
        className="mt-1 size-3 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-content">{signer.name ?? signer.email}</p>
        <p className="truncate text-sm text-content-secondary">
          {signer.email} · <span className="capitalize">{signer.role.replace(/_/g, ' ')}</span>
        </p>
        <p className="text-sm text-content-tertiary">{describeActivity(signer)}</p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {blocker ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-sm text-content-secondary">
            <Clock aria-hidden="true" className="size-3.5" />
            Waiting its turn
          </span>
        ) : (
          <Badge variant={status.variant} size="sm">
            <Badge.Icon>
              <StatusIcon className="size-3" />
            </Badge.Icon>
            <Badge.Label>{status.label}</Badge.Label>
          </Badge>
        )}

        {shareable && signer.slug ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 sm:min-h-0"
            onClick={() =>
              void copy(
                `${window.location.origin}/sign/${request.externalId}/${signer.slug}`,
                `Signing link for ${signer.name ?? signer.email} copied.`,
              )
            }
          >
            {copied ? (
              <Check aria-hidden="true" className="size-3.5" />
            ) : (
              <Copy aria-hidden="true" className="size-3.5" />
            )}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        ) : null}

        {remindable ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 sm:min-h-0"
            disabled={remind.isPending}
            onClick={() =>
              // `mutate`, not `mutateAsync`: the mutation invalidates the list,
              // which can unmount this row mid-flight, and a rejected promise
              // from an unmounted component is a console error nobody traces
              // back here. `mutate` never rejects.
              remind.mutate(
                { submissionId: request.id, signerId: signer.id },
                {
                  onSuccess: () =>
                    toast.success(`Reminder sent to ${signer.name ?? signer.email}.`),
                  onError: (error) =>
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : 'We couldn’t send that reminder. Please try again.',
                    ),
                },
              )
            }
          >
            <Send aria-hidden="true" className="size-3.5" />
            {remind.isPending ? 'Sending…' : 'Remind'}
          </Button>
        ) : null}
      </div>
    </li>
  );
}
